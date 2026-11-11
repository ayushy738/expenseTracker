package com.depositflow.smsprobe.data.local

import androidx.room.withTransaction
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import java.util.UUID

data class CandidateInsertResult(val captureId: String, val status: CandidateStatus, val mergedExactDuplicate: Boolean)
data class CandidateSyncItem(val candidate: TransactionCandidate, val syncState: CandidateSyncState, val syncError: String?)

class CandidateRepository(
    private val database: CandidateDatabase,
    private val cipher: CandidatePayloadCipher,
    private val onQueueChanged: () -> Unit = {},
) {
    private val dao = database.candidateDao()

    fun observeCandidates(): Flow<List<TransactionCandidate>> = dao.observeLatest().map { entities ->
        entities.mapNotNull(::decode)
    }

    fun observeCounts(): Flow<CandidateCounts> = combine(
        dao.observeTotalCount(), dao.observePendingCount(), dao.observePossibleDuplicateCount(),
    ) { total, pending, possible -> CandidateCounts(total, pending, possible) }

    fun observeSyncCounts(): Flow<SyncCounts> = combine(
        dao.observeQueuedCount(), dao.observeUploadingCount(), dao.observeSyncedCount(), dao.observeFailedCount(),
    ) { queued, uploading, synced, failed -> SyncCounts(queued, uploading, synced, failed) }

    fun observeFailedItems(): Flow<List<CandidateSyncItem>> = dao.observeFailed().map { entities ->
        entities.mapNotNull { entity -> decode(entity)?.let { CandidateSyncItem(it, CandidateSyncState.FAILED, entity.syncError) } }
    }

    suspend fun claimNext(now: Long = System.currentTimeMillis()): CandidateSyncItem? = database.withTransaction {
        val staleBefore = now - 10 * 60 * 1000L
        val entity = dao.findClaimable(staleBefore) ?: return@withTransaction null
        if (dao.claim(entity.captureId, now, staleBefore) != 1) return@withTransaction null
        val updated = entity.copy(syncState = CandidateSyncState.UPLOADING.name, syncStartedAt = now, syncAttempts = entity.syncAttempts + 1)
        decode(updated)?.let { CandidateSyncItem(it, CandidateSyncState.UPLOADING, null) }
    }

    suspend fun complete(captureId: String) { dao.finishUpload(captureId, CandidateSyncState.SYNCED.name, null) }
    suspend fun requeue(captureId: String, error: String? = null) { dao.finishUpload(captureId, CandidateSyncState.QUEUED.name, error) }
    suspend fun fail(captureId: String, safeMessage: String) { dao.finishUpload(captureId, CandidateSyncState.FAILED.name, safeMessage) }
    suspend fun retryFailed(): Int = dao.retryFailed()
    suspend fun clearQueue() = dao.clearAll()

    suspend fun insert(candidate: TransactionCandidate): CandidateInsertResult = database.withTransaction {
        val fingerprints = CandidateFingerprints.forCandidate(candidate)
        val lookback = candidate.capturedAt - 10 * 60 * 1000L
        val relevant = mutableListOf<CandidateEntity>()
        fingerprints.reference?.let { relevant.addAll(dao.findByReferenceFingerprint(it)) }
        relevant.addAll(dao.findByCoarseFingerprint(fingerprints.coarse, lookback))
        val relevantEntities = relevant.distinctBy(CandidateEntity::captureId)
        val decoded = relevantEntities.mapNotNull { entity -> decode(entity)?.let { entity to it } }
        val result = when (val decision = CandidateDeduplicator.decide(candidate, decoded.map { it.second })) {
            is CandidateDeduplicationDecision.MergeExact -> {
                val (entity, prior) = decoded.first { it.second.captureId == decision.existingCaptureId }
                val merged = prior.copy(sources = prior.sources + candidate.sources)
                val encrypted = cipher.encrypt(CandidatePayloadCodec.encode(merged), prior.captureId)
                dao.update(entity.copy(encryptedPayload = encrypted.ciphertext, payloadIv = encrypted.iv))
                CandidateInsertResult(prior.captureId, prior.status, mergedExactDuplicate = true)
            }
            is CandidateDeduplicationDecision.KeepForReview -> {
                val matches = decoded.filter { it.second.captureId in decision.existingCaptureIds }
                val groupId = matches.firstNotNullOfOrNull { it.first.duplicateGroupId } ?: matches.firstOrNull()?.first?.captureId ?: UUID.randomUUID().toString()
                matches.forEach { (entity, _) ->
                    if (entity.status != CandidateStatus.POSSIBLE_DUPLICATE.name || entity.duplicateGroupId != groupId) {
                        dao.update(entity.copy(status = CandidateStatus.POSSIBLE_DUPLICATE.name, duplicateGroupId = groupId))
                    }
                }
                val pending = candidate.copy(status = CandidateStatus.POSSIBLE_DUPLICATE, duplicateGroupId = groupId)
                dao.insert(toEntity(pending, fingerprints))
                CandidateInsertResult(pending.captureId, pending.status, mergedExactDuplicate = false)
            }
            CandidateDeduplicationDecision.InsertNew -> {
                dao.insert(toEntity(candidate, fingerprints))
                CandidateInsertResult(candidate.captureId, candidate.status, mergedExactDuplicate = false)
            }
        }
        onQueueChanged()
        result
    }

    private fun toEntity(candidate: TransactionCandidate, fingerprints: CandidateFingerprintSet): CandidateEntity {
        val encrypted = cipher.encrypt(CandidatePayloadCodec.encode(candidate), candidate.captureId)
        return CandidateEntity(
            captureId = candidate.captureId,
            capturedAt = candidate.capturedAt,
            sourceKind = candidate.source.name,
            sourceIdentifier = candidate.sourceIdentifier,
            status = candidate.status.name,
            duplicateGroupId = candidate.duplicateGroupId,
            referenceFingerprint = fingerprints.reference,
            exactReferenceFingerprint = fingerprints.exactReference,
            coarseFingerprint = fingerprints.coarse,
            merchantFingerprint = fingerprints.merchant,
            encryptedPayload = encrypted.ciphertext,
            payloadIv = encrypted.iv,
        )
    }

    private fun decode(entity: CandidateEntity): TransactionCandidate? = runCatching {
        CandidatePayloadCodec.decode(cipher.decrypt(EncryptedPayload(entity.encryptedPayload, entity.payloadIv), entity.captureId), entity)
            .also { require(it.captureId == entity.captureId) }
    }.getOrNull()
}

