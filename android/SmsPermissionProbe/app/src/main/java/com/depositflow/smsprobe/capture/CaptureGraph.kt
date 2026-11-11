package com.depositflow.smsprobe.capture

import android.content.Context
import com.depositflow.smsprobe.data.local.CandidateDatabase
import com.depositflow.smsprobe.data.local.CandidatePayloadCipher
import com.depositflow.smsprobe.data.local.CandidateRepository
import com.depositflow.smsprobe.sync.SyncScheduler

object CaptureGraph {
    @Volatile private var repository: CandidateRepository? = null
    @Volatile private var settings: CaptureSettingsStore? = null

    fun repository(context: Context): CandidateRepository = repository ?: synchronized(this) {
        val appContext = context.applicationContext
        SyncScheduler.ensurePeriodic(appContext)
        repository ?: CandidateRepository(CandidateDatabase.get(appContext), CandidatePayloadCipher()) {
            SyncScheduler.enqueue(appContext)
        }.also { repository = it }
    }

    fun settings(context: Context): CaptureSettingsStore = settings ?: synchronized(this) {
        settings ?: CaptureSettingsStore(context).also { settings = it }
    }
}
