package com.depositflow.smsprobe.data

import java.util.UUID

enum class E2eSyncState { PENDING, UPLOADING, UPLOADED, FAILED, DUPLICATE }

data class E2eTestRun(
    val captureId: String,
    val testRunId: String,
    val reference: String,
    val amount: Double,
    val timestamp: String,
)

object E2eTestPolicy {
    const val LOCAL_EMULATOR_ORIGIN = "http://10.0.2.2:3000"

    fun isLocalTestBackend(baseUrl: String, debugBuild: Boolean): Boolean =
        debugBuild && baseUrl.trim().trimEnd('/') == LOCAL_EMULATOR_ORIGIN

    fun canRun(debugBuild: Boolean, baseUrl: String, deviceActive: Boolean, backendReady: Boolean): Boolean =
        isLocalTestBackend(baseUrl, debugBuild) && deviceActive && backendReady

    fun newRun(timestamp: String, newId: () -> String = { UUID.randomUUID().toString() }): E2eTestRun {
        val captureId = newId()
        val testRunId = newId()
        require(UUID.fromString(captureId).toString() == captureId.lowercase())
        require(UUID.fromString(testRunId).toString() == testRunId.lowercase())
        return E2eTestRun(captureId, testRunId, "E2E-$testRunId", 2.50, timestamp)
    }
}
