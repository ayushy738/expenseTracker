package com.depositflow.smsprobe.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.ColumnInfo

@Entity(
    tableName = "transaction_candidates",
    indices = [
        Index(value = ["referenceFingerprint"]),
        Index(value = ["exactReferenceFingerprint"]),
        Index(value = ["coarseFingerprint"]),
        Index(value = ["capturedAt"]),
    ],
)
data class CandidateEntity(
    @PrimaryKey val captureId: String,
    val capturedAt: Long,
    val sourceKind: String,
    val sourceIdentifier: String,
    val status: String,
    val duplicateGroupId: String?,
    val referenceFingerprint: String?,
    val exactReferenceFingerprint: String?,
    val coarseFingerprint: String,
    val merchantFingerprint: String?,
    val encryptedPayload: String,
    val payloadIv: String,
    val syncState: String = "QUEUED",
    val syncStartedAt: Long? = null,
    val syncAttempts: Int = 0,
    val syncError: String? = null,
    val isSynthetic: Boolean = false,
    @ColumnInfo(defaultValue = "'SUPPRESSED'") val notificationState: String = "SUPPRESSED",
)
