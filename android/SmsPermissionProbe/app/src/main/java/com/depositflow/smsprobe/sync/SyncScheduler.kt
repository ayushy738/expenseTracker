package com.depositflow.smsprobe.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.BackoffPolicy
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

object SyncScheduler {
    private const val PERIODIC = "finance-transaction-periodic-sync"
    private const val IMMEDIATE = "finance-transaction-sync"

    private val constraints get() = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    fun enqueue(context: Context) {
        val request = OneTimeWorkRequestBuilder<TransactionSyncWorker>()
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(IMMEDIATE, ExistingWorkPolicy.APPEND_OR_REPLACE, request)
    }

    fun ensurePeriodic(context: Context) {
        val request = PeriodicWorkRequestBuilder<TransactionSyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, request)
    }
}
