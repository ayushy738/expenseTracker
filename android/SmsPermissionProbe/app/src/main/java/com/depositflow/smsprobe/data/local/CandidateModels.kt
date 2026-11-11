package com.depositflow.smsprobe.data.local

import java.util.UUID

enum class TransactionType { DEBIT, CREDIT, UNKNOWN }
enum class TransactionMode { UPI, CARD, ATM, CASH_DEPOSIT, IMPS, NEFT, RTGS, BANK_TRANSFER, OTHER }
enum class CaptureSource { SMS, NOTIFICATION }
enum class CandidateStatus { PENDING, POSSIBLE_DUPLICATE, NEEDS_REVIEW }
enum class CandidateSyncState { QUEUED, UPLOADING, SYNCED, FAILED, LOCAL_ONLY }
enum class NotificationState { PENDING, CLAIMED, POSTED, SUPPRESSED }

data class TransactionCandidate(
    val captureId: String = UUID.randomUUID().toString(),
    val amountMinor: Long,
    val transactionType: TransactionType,
    val transactionMode: TransactionMode = TransactionMode.OTHER,
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
    val isSynthetic: Boolean = false,
    val accountSuffix: String? = null,
)

data class CandidateCounts(val total: Int, val pending: Int, val possibleDuplicates: Int, val needsReview: Int = 0)

data class SyncCounts(val queued: Int, val uploading: Int, val synced: Int, val failed: Int, val localOnly: Int = 0)
