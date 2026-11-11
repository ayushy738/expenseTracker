package com.depositflow.smsprobe.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.depositflow.smsprobe.capture.CaptureGraph
import com.depositflow.smsprobe.data.PairingApi
import com.depositflow.smsprobe.data.PairingApiException
import com.depositflow.smsprobe.data.PairingStatus
import com.depositflow.smsprobe.data.UploadDisposition
import com.depositflow.smsprobe.data.UploadPolicy
import com.depositflow.smsprobe.data.UploadTransaction
import com.depositflow.smsprobe.security.DeviceCredentialStore
import java.time.Instant
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.withContext

class TransactionSyncWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val preferences = SyncPreferences(applicationContext)
        val credential = DeviceCredentialStore(applicationContext).load() ?: run {
            preferences.setWarning("Pair this device before syncing queued transactions.")
            return@withContext Result.success()
        }
        val repository = CaptureGraph.repository(applicationContext)
        try {
            // A permission grant or app restart can resume notifications for transactions
            // already inserted by a prior 201 response. This never retries an upload.
            TransactionNotificationDispatcher.deliverPending(applicationContext, repository, credential.baseUrl)
            if (preferences.isPaused()) return@withContext Result.success()
            val status = PairingApi.status(credential.baseUrl, credential.token)
            if (status != PairingStatus.ACTIVE) {
                if (status == PairingStatus.REVOKED) preferences.setPaused(true)
                preferences.setWarning(if (status == PairingStatus.REVOKED) "This device was revoked. Re-pair before syncing." else "This device is pending owner approval. Queued transactions are waiting.")
                return@withContext Result.success()
            }
            preferences.setWarning(null)
            while (!isStopped) {
                val item = repository.claimNext() ?: break
                val candidate = item.candidate
                if (candidate.isSynthetic || candidate.status == com.depositflow.smsprobe.data.local.CandidateStatus.NEEDS_REVIEW ||
                    candidate.transactionType == com.depositflow.smsprobe.data.local.TransactionType.UNKNOWN) {
                    repository.markLocalOnly(candidate.captureId)
                    continue
                }
                val upload = UploadTransaction(
                    captureId = candidate.captureId,
                    amount = candidate.amountMinor / 100.0,
                    transactionType = candidate.transactionType.name,
                    timestamp = Instant.ofEpochMilli(candidate.transactionTimestamp).toString(),
                    bank = candidate.bank,
                    merchant = candidate.merchant,
                    reference = candidate.reference,
                    isSynthetic = candidate.isSynthetic,
                )
                val response = try {
                    PairingApi.upload(credential.baseUrl, credential.token, upload)
                } catch (error: Exception) {
                    if (error is CancellationException) throw error
                    repository.requeue(candidate.captureId, "Network error; will retry automatically.")
                    preferences.setWarning("Network or server error. Sync will retry when the connection is available.")
                    return@withContext Result.retry()
                }
                when (UploadPolicy.classify(response)) {
                    UploadDisposition.SYNCED -> {
                        val newlyInserted = UploadPolicy.isNewInsertion(response) &&
                            TransactionNotificationPolicy.isProductionOrigin(credential.baseUrl)
                        repository.complete(candidate.captureId, newlyInsertedOnServer = newlyInserted)
                        if (newlyInserted) {
                            TransactionNotificationDispatcher.deliverNewProductionSync(
                                applicationContext, repository, candidate.captureId, credential.baseUrl,
                            )
                        }
                        preferences.markSuccess()
                        preferences.setWarning(null)
                    }
                    UploadDisposition.AUTH_REQUIRED -> {
                        repository.requeue(candidate.captureId)
                        preferences.setPaused(true)
                        preferences.setWarning("Device credentials were rejected or revoked. Re-pair this device to resume synchronization.")
                        return@withContext Result.success()
                    }
                    UploadDisposition.CLOCK_SKEW -> {
                        repository.requeue(candidate.captureId)
                        preferences.setWarning("Phone clock is outside the server time window. Correct the device time, then retry sync.")
                        return@withContext Result.success()
                    }
                    UploadDisposition.RETRY -> {
                        repository.requeue(candidate.captureId, "Temporary server/network error; retry scheduled.")
                        preferences.setWarning("Temporary server/network error. Sync will retry automatically.")
                        return@withContext Result.retry()
                    }
                    UploadDisposition.FAILED -> {
                        repository.fail(candidate.captureId, response.safeMessage ?: "The server rejected this transaction. Review it before retrying.")
                    }
                    UploadDisposition.NOT_DUPLICATE -> {
                        repository.fail(candidate.captureId, "The server returned an unexpected response. Review this transaction before retrying.")
                    }
                }
            }
            Result.success()
        } catch (error: PairingApiException) {
            when (error.code) {
                "CLOCK_SKEW" -> preferences.setWarning("Phone clock is outside the server time window. Correct the device time, then retry sync.")
                else -> {
                    preferences.setPaused(true)
                    preferences.setWarning("Device credentials were rejected or revoked. Re-pair this device to resume synchronization.")
                }
            }
            Result.success()
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            // Do not include exception text because platform/network errors can contain sensitive request details.
            Result.retry()
        }
    }
}
