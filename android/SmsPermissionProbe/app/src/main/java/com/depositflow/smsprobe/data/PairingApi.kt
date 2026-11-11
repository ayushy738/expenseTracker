package com.depositflow.smsprobe.data

import com.depositflow.smsprobe.BuildConfig
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import javax.net.ssl.HttpsURLConnection

data class ClaimResult(val status: PairingStatus, val duplicate: Boolean)
data class UploadResponse(
    val httpStatus: Int,
    val duplicate: Boolean,
    val code: String? = null,
    val safeMessage: String? = null,
    val transactionId: String? = null,
    val transactionStatus: String? = null,
)
data class UploadTransaction(
    val captureId: String,
    val amount: Double,
    val transactionType: String,
    val timestamp: String,
    val bank: String?,
    val merchant: String?,
    val reference: String?,
    val isSynthetic: Boolean = false,
)

object UploadPayloadMapper {
    fun toFields(transaction: UploadTransaction): Map<String, Any> {
        require(!transaction.isSynthetic) { "Synthetic test transactions cannot be uploaded." }
        require(transaction.transactionType == "DEBIT" || transaction.transactionType == "CREDIT") {
            "Transactions needing review cannot be uploaded."
        }
        return buildMap {
        put("captureId", transaction.captureId)
        put("amount", transaction.amount)
        put("transactionType", transaction.transactionType)
        put("timestamp", transaction.timestamp)
        transaction.bank?.takeIf(String::isNotBlank)?.let { put("bank", it) }
        transaction.merchant?.takeIf(String::isNotBlank)?.let { put("merchant", it) }
        transaction.reference?.takeIf(String::isNotBlank)?.let { put("reference", it) }
        }
    }
}

enum class UploadDisposition { SYNCED, AUTH_REQUIRED, CLOCK_SKEW, RETRY, FAILED, NOT_DUPLICATE }

object UploadPolicy {
    fun isNewInsertion(response: UploadResponse): Boolean = response.httpStatus == 201 && !response.duplicate

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

    fun retryDelayMillis(attempt: Int): Long = (30_000L * (1L shl (attempt.coerceIn(1, 12) - 1))).coerceAtMost(6 * 60 * 60 * 1000L)
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
    fun validateBaseUrl(value: String, allowLocalE2e: Boolean = BuildConfig.DEBUG): String {
        val uri = runCatching { URI(value.trim()) }.getOrElse { throw IllegalArgumentException("Enter a valid HTTPS website URL.") }
        require(!uri.host.isNullOrBlank()) { "Enter a valid website URL." }
        val isHttps = uri.scheme.equals("https", ignoreCase = true)
        val scheme = uri.scheme?.lowercase().orEmpty()
        val normalizedLocal = "$scheme://${uri.rawAuthority}${uri.rawPath.orEmpty().takeIf { it != "/" }.orEmpty()}"
        val isLocalDebug = allowLocalE2e && E2eTestPolicy.isLocalTestBackend(normalizedLocal, BuildConfig.DEBUG)
        require(isHttps || isLocalDebug) {
            "Use HTTPS, or the Android emulator's local E2E address in a debug build."
        }
        require(uri.userInfo == null && uri.query == null && uri.fragment == null && (uri.path.isNullOrEmpty() || uri.path == "/")) {
            "Enter only the website origin, such as https://example.vercel.app."
        }
        require(!isLocalDebug || uri.rawAuthority == "10.0.2.2:3000") { "Local E2E requests are restricted to 10.0.2.2:3000." }
        return "$scheme://${uri.rawAuthority}"
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
        return postUpload("${validateBaseUrl(baseUrl, allowLocalE2e = false)}/api/sms", deviceToken, json.toString())
    }

    fun e2eStatus(baseUrl: String, deviceToken: String): Boolean {
        require(E2eTestPolicy.isLocalTestBackend(baseUrl, BuildConfig.DEBUG)) { "E2E is available only on the local Android emulator backend." }
        return request("${validateBaseUrl(baseUrl)}/api/sms/e2e-status", "GET", token = deviceToken).optBoolean("enabled")
    }

    fun uploadE2e(baseUrl: String, deviceToken: String, run: E2eTestRun): UploadResponse {
        require(E2eTestPolicy.isLocalTestBackend(baseUrl, BuildConfig.DEBUG)) { "E2E uploads require the local development backend." }
        val json = JSONObject()
            .put("captureId", run.captureId)
            .put("testRunId", run.testRunId)
            .put("isTest", true)
            .put("amount", run.amount)
            .put("transactionType", "DEBIT")
            .put("bank", "E2E TEST BANK")
            .put("merchant", "E2E TESTSTORE")
            .put("reference", run.reference)
            .put("timestamp", run.timestamp)
        return postUpload("${validateBaseUrl(baseUrl)}/api/sms", deviceToken, json.toString(), e2e = true)
    }

    private fun postUpload(url: String, token: String, body: String, e2e: Boolean = false): UploadResponse {
        val connection = URL(url).openConnection() as? HttpURLConnection ?: throw IllegalArgumentException("Synchronization requires HTTP(S).")
        if (connection !is HttpsURLConnection && !(e2e && BuildConfig.DEBUG && E2eTestPolicy.isLocalTestBackend(baseOrigin(url), true))) {
            throw IllegalArgumentException("Synchronization requires HTTPS.")
        }
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
        if (e2e) connection.setRequestProperty("X-Deposit-Flow-E2E", "1")
        try {
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val responseBody = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            val json = runCatching { JSONObject(responseBody) }.getOrElse { JSONObject() }
            return UploadResponse(
                status,
                json.optBoolean("duplicate"),
                json.optString("code").ifBlank { null },
                safeUploadMessage(status),
                json.optString("id").ifBlank { null },
                json.optString("status").ifBlank { null },
            )
        } finally { connection.disconnect() }
    }

    private fun request(url: String, method: String, body: String? = null, token: String? = null): JSONObject {
        val connection = URL(url).openConnection() as? HttpURLConnection
            ?: throw IllegalArgumentException("Pairing requires HTTP(S).")
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

private fun baseOrigin(url: String): String = URI(url).let { "${it.scheme}://${it.rawAuthority}" }

private fun safeUploadMessage(status: Int): String? = when (status) {
    400 -> "The server rejected this transaction's fields. Review the candidate before retrying."
    413 -> "The server rejected the transaction because the request was too large."
    415 -> "The server requires JSON; retry after updating the app."
    in 400..499 -> "The server rejected this transaction (HTTP $status)."
    else -> null
}

class PairingApiException(message: String, val httpStatus: Int, val code: String? = null) : Exception(message)
