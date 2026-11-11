package com.depositflow.smsprobe.data.local

import java.util.UUID

enum class TransactionType { DEBIT, CREDIT }
enum class CaptureSource { SMS, NOTIFICATION }
enum class CandidateStatus { PENDING, POSSIBLE_DUPLICATE }
enum class CandidateSyncState { QUEUED, UPLOADING, SYNCED, FAILED }

data class TransactionCandidate(
    val captureId: String = UUID.randomUUID().toString(),
    val amountMinor: Long,
    val transactionType: TransactionType,
    val transactionTimestamp: Long,
    val capturedAt: Long,
    val bank: String,
    val merchant: String?,
    val reference: String?,
    val source: CaptureSource,
    val sourceIdentifier: String,
    val sources: Set<String> = setOf("${source.name}:$sourceIdentifier"),
    val status: CandidateStatus = CandidateStatus.PENDING,
    val duplicateGroupId: String? = null,
)

data class CandidateCounts(val total: Int, val pending: Int, val possibleDuplicates: Int)

data class SyncCounts(val queued: Int, val uploading: Int, val synced: Int, val failed: Int)
