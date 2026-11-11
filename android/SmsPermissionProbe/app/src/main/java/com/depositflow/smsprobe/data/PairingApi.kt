package com.depositflow.smsprobe.data

import org.json.JSONObject
import java.net.URI
import java.net.URL
import javax.net.ssl.HttpsURLConnection

data class ClaimResult(val status: PairingStatus, val duplicate: Boolean)
data class UploadResponse(val httpStatus: Int, val duplicate: Boolean, val code: String? = null, val safeMessage: String? = null)
data class UploadTransaction(
    val captureId: String,
    val amount: Double,
    val transactionType: String,
    val timestamp: String,
    val bank: String?,
    val merchant: String?,
    val reference: String?,
)

object UploadPayloadMapper {
    fun toFields(transaction: UploadTransaction): Map<String, Any> = buildMap {
        put("captureId", transaction.captureId)
        put("amount", transaction.amount)
        put("transactionType", transaction.transactionType)
        put("timestamp", transaction.timestamp)
        transaction.bank?.takeIf(String::isNotBlank)?.let { put("bank", it) }
        transaction.merchant?.takeIf(String::isNotBlank)?.let { put("merchant", it) }
        transaction.reference?.takeIf(String::isNotBlank)?.let { put("reference", it) }
    }
}

enum class UploadDisposition { SYNCED, AUTH_REQUIRED, CLOCK_SKEW, RETRY, FAILED, NOT_DUPLICATE }

object UploadPolicy {
    fun classify(response: UploadResponse): UploadDisposition = when {
        response.httpStatus == 201 -> UploadDisposition.SYNCED
        response.httpStatus == 200 && response.duplicate -> UploadDisposition.SYNCED
        response.httpStatus == 401 && response.code == "CLOCK_SKEW" -> UploadDisposition.CLOCK_SKEW
        response.httpStatus == 401 -> UploadDisposition.AUTH_REQUIRED
        response.httpStatus == 429 || response.httpStatus >= 500 -> UploadDisposition.RETRY
        response.httpStatus == 200 -> UploadDisposition.NOT_DUPLICATE
        response.httpStatus in 400..499 -> UploadDisposition.FAILED
        else -> UploadDisposition.RETRY
    }

    fun retryDelayMillis(attempt: Int): Long = (30_000L * (1L shl (attempt.coerceIn(0, 10) - 1).coerceAtLeast(0))).coerceAtMost(6 * 60 * 60 * 1000L)
}

object SyncStateTransitions {
    fun target(current: String, event: String): String? = when (event) {
        "CLAIM" -> if (current == "QUEUED" || current == "STALE_UPLOADING") "UPLOADING" else null
        "SUCCESS" -> if (current == "UPLOADING") "SYNCED" else null
        "RETRY" -> if (current == "UPLOADING") "QUEUED" else null
        "PERMANENT_FAILURE" -> if (current == "UPLOADING") "FAILED" else null
        "MANUAL_RETRY" -> if (current == "FAILED") "QUEUED" else null
        else -> null
    }
}

object PairingApi {
    fun validateBaseUrl(value: String): String {
        val uri = runCatching { URI(value.trim()) }.getOrElse { throw IllegalArgumentException("Enter a valid HTTPS website URL.") }
        require(uri.scheme.equals("https", ignoreCase = true) && !uri.host.isNullOrBlank()) {
            "Pairing requires an HTTPS website URL."
        }
        require(uri.userInfo == null && uri.query == null && uri.fragment == null && (uri.path.isNullOrEmpty() || uri.path == "/")) {
            "Enter only the website origin, such as https://example.vercel.app."
        }
        return "https://${uri.rawAuthority}"
    }

    fun claim(baseUrl: String, code: String, deviceName: String, deviceToken: String): ClaimResult {
        val response = request(
            url = "${validateBaseUrl(baseUrl)}/api/device-pairings/claim",
            method = "POST",
            body = JSONObject().put("code", code).put("deviceName", deviceName).put("deviceToken", deviceToken).toString()
        )
        return ClaimResult(PairingStatus.fromApi(response.getString("status")), response.optBoolean("duplicate"))
    }

    fun status(baseUrl: String, deviceToken: String): PairingStatus =
        PairingStatus.fromApi(request("${validateBaseUrl(baseUrl)}/api/device/status", "GET", token = deviceToken).optString("status"))

    fun disconnect(baseUrl: String, deviceToken: String): PairingStatus =
        PairingStatus.fromApi(request("${validateBaseUrl(baseUrl)}/api/device/disconnect", "POST", token = deviceToken).optString("status"))

    fun upload(baseUrl: String, deviceToken: String, transaction: UploadTransaction): UploadResponse {
        val json = JSONObject(UploadPayloadMapper.toFields(transaction))
        return postUpload("${validateBaseUrl(baseUrl)}/api/sms", deviceToken, json.toString())
    }

    private fun postUpload(url: String, token: String, body: String): UploadResponse {
        val connection = URL(url).openConnection() as? HttpsURLConnection ?: throw IllegalArgumentException("Synchronization requires HTTPS.")
        connection.requestMethod = "POST"
        connection.connectTimeout = 15_000
        connection.readTimeout = 20_000
        connection.instanceFollowRedirects = false
        connection.useCaches = false
        connection.doOutput = true
        connection.setRequestProperty("Accept", "application/json")
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
        connection.setRequestProperty("Authorization", "Bearer $token")
        connection.setRequestProperty("X-Device-Timestamp", System.currentTimeMillis().toString())
        try {
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val responseBody = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            val json = runCatching { JSONObject(responseBody) }.getOrElse { JSONObject() }
            return UploadResponse(status, json.optBoolean("duplicate"), json.optString("code").ifBlank { null }, safeUploadMessage(status))
        } finally { connection.disconnect() }
    }

    private fun request(url: String, method: String, body: String? = null, token: String? = null): JSONObject {
        val connection = URL(url).openConnection() as? HttpsURLConnection
            ?: throw IllegalArgumentException("Pairing requires HTTPS.")
        connection.requestMethod = method
        connection.connectTimeout = 15_000
        connection.readTimeout = 15_000
        connection.instanceFollowRedirects = false
        connection.useCaches = false
        connection.setRequestProperty("Accept", "application/json")
        if (body != null) {
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
        }
        if (token != null) {
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("X-Device-Timestamp", System.currentTimeMillis().toString())
        }
        try {
            if (body != null) connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val statusCode = connection.responseCode
            val stream = if (statusCode in 200..299) connection.inputStream else connection.errorStream
            val responseText = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            val json = runCatching { JSONObject(responseText) }.getOrElse { JSONObject() }
            if (statusCode !in 200..299) {
                throw PairingApiException(json.optString("message").ifBlank { "Pairing request failed ($statusCode)." }, statusCode, json.optString("code").ifBlank { null })
            }
            return json
        } finally {
            connection.disconnect()
        }
    }
}

private fun safeUploadMessage(status: Int): String? = when (status) {
    400 -> "The server rejected this transaction's fields. Review the candidate before retrying."
    413 -> "The server rejected the transaction because the request was too large."
    415 -> "The server requires JSON; retry after updating the app."
    in 400..499 -> "The server rejected this transaction (HTTP $status)."
    else -> null
}

class PairingApiException(message: String, val httpStatus: Int, val code: String? = null) : Exception(message)
