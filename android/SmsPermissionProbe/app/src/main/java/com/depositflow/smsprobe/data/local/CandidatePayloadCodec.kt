package com.depositflow.smsprobe.data.local

import org.json.JSONArray
import org.json.JSONObject

object CandidatePayloadCodec {
    fun encode(candidate: TransactionCandidate): String = JSONObject()
        .put("captureId", candidate.captureId)
        .put("amountMinor", candidate.amountMinor)
        .put("transactionType", candidate.transactionType.name)
        .put("transactionMode", candidate.transactionMode.name)
        .put("transactionTimestamp", candidate.transactionTimestamp)
        .put("bank", candidate.bank)
        .put("merchant", candidate.merchant ?: JSONObject.NULL)
        .put("reference", candidate.reference ?: JSONObject.NULL)
        .put("source", candidate.source.name)
        .put("sourceIdentifier", candidate.sourceIdentifier)
        .put("isSynthetic", candidate.isSynthetic)
        .put("accountSuffix", candidate.accountSuffix ?: JSONObject.NULL)
        .put("sources", JSONArray(candidate.sources.sorted()))
        .toString()

    fun decode(value: String, entity: CandidateEntity): TransactionCandidate {
        val json = JSONObject(value)
        val merchant = json.optString("merchant").takeUnless { it.isBlank() || it == "null" }
        val reference = json.optString("reference").takeUnless { it.isBlank() || it == "null" }
        val accountSuffix = json.optString("accountSuffix").takeIf { it.matches(Regex("[0-9]{4}")) }
        val sourcesJson = json.optJSONArray("sources") ?: JSONArray()
        val sources = (0 until sourcesJson.length()).mapNotNull { sourcesJson.optString(it).takeIf(String::isNotBlank) }.toSet()
        return TransactionCandidate(
            captureId = json.getString("captureId"),
            amountMinor = json.getLong("amountMinor"),
            transactionType = TransactionType.valueOf(json.getString("transactionType")),
            transactionMode = json.optString("transactionMode").takeIf(String::isNotBlank)?.let(TransactionMode::valueOf) ?: TransactionMode.OTHER,
            transactionTimestamp = json.getLong("transactionTimestamp"),
            capturedAt = entity.capturedAt,
            bank = json.getString("bank"),
            merchant = merchant,
            reference = reference,
            source = CaptureSource.valueOf(json.getString("source")),
            sourceIdentifier = json.getString("sourceIdentifier"),
            sources = sources,
            status = CandidateStatus.valueOf(entity.status),
            duplicateGroupId = entity.duplicateGroupId,
            isSynthetic = json.optBoolean("isSynthetic", entity.isSynthetic),
            accountSuffix = accountSuffix,
        )
    }
}
