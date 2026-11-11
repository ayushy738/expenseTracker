package com.depositflow.smsprobe.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface CandidateDao {
    @Query("SELECT * FROM transaction_candidates ORDER BY capturedAt DESC LIMIT 100")
    fun observeLatest(): Flow<List<CandidateEntity>>

    @Query("SELECT * FROM transaction_candidates ORDER BY capturedAt DESC")
    suspend fun getAll(): List<CandidateEntity>

    @Query("SELECT COUNT(*) FROM transaction_candidates")
    fun observeTotalCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM transaction_candidates WHERE status = 'PENDING'")
    fun observePendingCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM transaction_candidates WHERE status = 'POSSIBLE_DUPLICATE'")
    fun observePossibleDuplicateCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM transaction_candidates WHERE status = 'NEEDS_REVIEW'")
    fun observeNeedsReviewCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM transaction_candidates WHERE syncState = 'QUEUED'")
    fun observeQueuedCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM transaction_candidates WHERE syncState = 'UPLOADING'")
    fun observeUploadingCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM transaction_candidates WHERE syncState = 'SYNCED'")
    fun observeSyncedCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM transaction_candidates WHERE syncState = 'FAILED'")
    fun observeFailedCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM transaction_candidates WHERE syncState = 'LOCAL_ONLY'")
    fun observeLocalOnlyCount(): Flow<Int>

    @Query("SELECT * FROM transaction_candidates WHERE syncState = 'FAILED' ORDER BY capturedAt DESC LIMIT 50")
    fun observeFailed(): Flow<List<CandidateEntity>>

    @Query("SELECT * FROM transaction_candidates WHERE syncState = 'QUEUED' OR (syncState = 'UPLOADING' AND syncStartedAt <= :staleBefore) ORDER BY capturedAt ASC LIMIT 1")
    suspend fun findClaimable(staleBefore: Long): CandidateEntity?

    @Query("UPDATE transaction_candidates SET syncState = 'UPLOADING', syncStartedAt = :now, syncAttempts = syncAttempts + 1, syncError = NULL WHERE captureId = :captureId AND (syncState = 'QUEUED' OR (syncState = 'UPLOADING' AND syncStartedAt <= :staleBefore))")
    suspend fun claim(captureId: String, now: Long, staleBefore: Long): Int

    @Query("UPDATE transaction_candidates SET syncState = :state, syncStartedAt = NULL, syncError = :error WHERE captureId = :captureId AND syncState = 'UPLOADING'")
    suspend fun finishUpload(captureId: String, state: String, error: String?): Int

    @Query("UPDATE transaction_candidates SET notificationState = :state WHERE captureId = :captureId")
    suspend fun setNotificationState(captureId: String, state: String): Int

    @Query("UPDATE transaction_candidates SET notificationState = 'CLAIMED' WHERE captureId = :captureId AND syncState = 'SYNCED' AND isSynthetic = 0 AND notificationState = 'PENDING'")
    suspend fun claimNotification(captureId: String): Int

    @Query("UPDATE transaction_candidates SET notificationState = 'POSTED' WHERE captureId = :captureId AND notificationState = 'CLAIMED'")
    suspend fun markNotificationPosted(captureId: String): Int

    @Query("UPDATE transaction_candidates SET notificationState = 'PENDING' WHERE captureId = :captureId AND notificationState = 'CLAIMED'")
    suspend fun releaseNotificationClaim(captureId: String): Int

    @Query("SELECT * FROM transaction_candidates WHERE captureId = :captureId AND syncState = 'SYNCED'")
    suspend fun getSyncedCandidate(captureId: String): CandidateEntity?

    @Query("SELECT * FROM transaction_candidates WHERE syncState = 'SYNCED' AND isSynthetic = 0 AND notificationState = 'PENDING' ORDER BY capturedAt ASC LIMIT 100")
    suspend fun getPendingNotifications(): List<CandidateEntity>

    @Query("UPDATE transaction_candidates SET notificationState = 'SUPPRESSED' WHERE syncState = 'SYNCED' AND notificationState = 'PENDING'")
    suspend fun suppressPendingNotifications(): Int

    @Query("UPDATE transaction_candidates SET syncState = 'QUEUED', syncError = NULL WHERE syncState = 'FAILED'")
    suspend fun retryFailed(): Int

    @Query("UPDATE transaction_candidates SET syncState = 'LOCAL_ONLY', syncStartedAt = NULL WHERE captureId = :captureId AND syncState = 'UPLOADING'")
    suspend fun markLocalOnly(captureId: String): Int

    @Query("DELETE FROM transaction_candidates")
    suspend fun clearAll()

    @Query("SELECT * FROM transaction_candidates WHERE referenceFingerprint = :fingerprint ORDER BY capturedAt DESC LIMIT 50")
    suspend fun findByReferenceFingerprint(fingerprint: String): List<CandidateEntity>

    @Query("SELECT * FROM transaction_candidates WHERE coarseFingerprint = :fingerprint AND capturedAt >= :cutoff ORDER BY capturedAt DESC LIMIT 100")
    suspend fun findByCoarseFingerprint(fingerprint: String, cutoff: Long): List<CandidateEntity>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(entity: CandidateEntity)

    @Update
    suspend fun update(entity: CandidateEntity)
}
