package com.depositflow.smsprobe

import android.Manifest
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.depositflow.smsprobe.capture.CaptureGraph
import com.depositflow.smsprobe.capture.CaptureSources
import com.depositflow.smsprobe.capture.CaptureDiagnostics
import com.depositflow.smsprobe.capture.CaptureDiagnosticsStore
import com.depositflow.smsprobe.capture.SmsOutcome
import com.depositflow.smsprobe.data.PairingApi
import com.depositflow.smsprobe.data.E2eTestPolicy
import com.depositflow.smsprobe.data.E2eSyncState
import com.depositflow.smsprobe.data.PairingStatus
import com.depositflow.smsprobe.data.local.CandidateStatus
import com.depositflow.smsprobe.data.local.CandidateCounts
import com.depositflow.smsprobe.data.local.CandidateSyncItem
import com.depositflow.smsprobe.data.local.SyncCounts
import com.depositflow.smsprobe.data.local.TransactionCandidate
import com.depositflow.smsprobe.security.DeviceCredentialStore
import com.depositflow.smsprobe.security.DeviceTokenFactory
import com.depositflow.smsprobe.sync.SyncPreferences
import com.depositflow.smsprobe.sync.SyncScheduler
import com.depositflow.smsprobe.sync.TransactionNotificationPreferences
import com.depositflow.smsprobe.sync.TransactionNotificationPublisher
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.time.Instant
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.combine

class MainActivity : ComponentActivity() {
    private val permissionGranted = mutableStateOf(false)
    private val notificationAccessGranted = mutableStateOf(false)
    private val postNotificationsGranted = mutableStateOf(false)
    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> permissionGranted.value = granted }
    private val postNotificationsLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        postNotificationsGranted.value = granted
        if (granted) SyncScheduler.enqueue(applicationContext)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        permissionGranted.value = hasSmsPermission()
        val credentialStore = DeviceCredentialStore(applicationContext)
        val captureSettings = CaptureGraph.settings(applicationContext)
        val candidateRepository = CaptureGraph.repository(applicationContext)
        val syncPreferences = SyncPreferences(applicationContext)
        val diagnosticsStore = CaptureDiagnosticsStore(applicationContext)
        notificationAccessGranted.value = hasNotificationAccess()
        postNotificationsGranted.value = TransactionNotificationPublisher.hasPermission(this)
        val notificationPreferences = TransactionNotificationPreferences(applicationContext)

        setContent {
            val scope = rememberCoroutineScope()
            var storedCredential by remember { mutableStateOf(credentialStore.load()) }
            var pairingStatus by remember {
                mutableStateOf(if (storedCredential == null) PairingStatus.UNPAIRED else PairingStatus.CHECKING)
            }
            var baseUrl by remember { mutableStateOf(storedCredential?.baseUrl.orEmpty()) }
            var deviceName by remember { mutableStateOf(storedCredential?.deviceName ?: "Samsung phone") }
            var pairingCode by remember { mutableStateOf("") }
            var e2eBackendReady by remember { mutableStateOf(false) }
            var showE2eConfirmation by remember { mutableStateOf(false) }
            var e2eState by remember { mutableStateOf(E2eSyncState.PENDING) }
            var e2eResultMessage by remember { mutableStateOf("No test run yet.") }
            var e2eRunId by remember { mutableStateOf<String?>(null) }
            var message by remember { mutableStateOf("") }
            var busy by remember { mutableStateOf(false) }
            var candidates by remember { mutableStateOf<List<TransactionCandidate>>(emptyList()) }
            var candidateCounts by remember { mutableStateOf(CandidateCounts(0, 0, 0, 0)) }
            var syncCounts by remember { mutableStateOf(SyncCounts(0, 0, 0, 0)) }
            var failedCandidates by remember { mutableStateOf<List<CandidateSyncItem>>(emptyList()) }
            var syncWarning by remember { mutableStateOf(syncPreferences.warning()) }
            var syncPaused by remember { mutableStateOf(syncPreferences.isPaused()) }
            var lastSyncAt by remember { mutableStateOf(syncPreferences.lastSuccessAt()) }
            var transactionNotificationsEnabled by remember { mutableStateOf(notificationPreferences.isEnabled()) }
            var diagnostics by remember { mutableStateOf(diagnosticsStore.snapshot()) }
            var emulatorTestingEnabled by remember { mutableStateOf(captureSettings.emulatorSmsTestingEnabled()) }
            var enabledSmsIds by remember { mutableStateOf(captureSettings.enabledSmsIds()) }
            var enabledNotificationPackages by remember { mutableStateOf(captureSettings.enabledNotificationPackages()) }
            val smsCaptureReady = permissionGranted.value && enabledSmsIds.isNotEmpty()
            val notificationCaptureReady = notificationAccessGranted.value && enabledNotificationPackages.isNotEmpty()
            val parserStatus = when {
                smsCaptureReady || notificationCaptureReady -> "Ready · selected sources only"
                enabledSmsIds.isEmpty() && enabledNotificationPackages.isEmpty() -> "No sources enabled"
                enabledSmsIds.isNotEmpty() && !permissionGranted.value -> "Waiting for SMS permission"
                else -> "Waiting for notification access"
            }

            LaunchedEffect(Unit) {
                candidateRepository.observeCandidates().combine(candidateRepository.observeCounts()) { items, counts -> items to counts }
                    .collect { (items, counts) ->
                        candidates = items
                        candidateCounts = counts
                    }
            }

            LaunchedEffect(Unit) { candidateRepository.observeSyncCounts().collect { syncCounts = it } }
            LaunchedEffect(Unit) { candidateRepository.observeFailedItems().collect { failedCandidates = it } }
            LaunchedEffect(Unit) {
                while (true) {
                    syncWarning = syncPreferences.warning()
                    syncPaused = syncPreferences.isPaused()
                    lastSyncAt = syncPreferences.lastSuccessAt()
                    diagnostics = diagnosticsStore.snapshot()
                    delay(2_000)
                }
            }

            LaunchedEffect(storedCredential?.token) {
                val credential = storedCredential ?: return@LaunchedEffect
                pairingStatus = PairingStatus.CHECKING
                runCatching {
                    withContext(Dispatchers.IO) { PairingApi.status(credential.baseUrl, credential.token) }
                }.onSuccess {
                    pairingStatus = it
                    if (it == PairingStatus.ACTIVE) SyncScheduler.enqueue(applicationContext)
                }
                    .onFailure {
                        if ((it as? com.depositflow.smsprobe.data.PairingApiException)?.httpStatus == 401) pairingStatus = PairingStatus.REVOKED
                        message = it.message ?: "Could not check device status."
                    }
            }

            LaunchedEffect(storedCredential?.token, pairingStatus) {
                e2eBackendReady = false
                val credential = storedCredential ?: return@LaunchedEffect
                if (!E2eTestPolicy.canRun(BuildConfig.DEBUG, credential.baseUrl, pairingStatus == PairingStatus.ACTIVE, backendReady = true)) return@LaunchedEffect
                e2eBackendReady = runCatching {
                    withContext(Dispatchers.IO) { PairingApi.e2eStatus(credential.baseUrl, credential.token) }
                }.getOrDefault(false)
            }

            fun executeE2eTest() {
                val credential = storedCredential ?: return
                if (!E2eTestPolicy.canRun(BuildConfig.DEBUG, credential.baseUrl, pairingStatus == PairingStatus.ACTIVE, e2eBackendReady)) return
                val run = E2eTestPolicy.newRun(Instant.now().toString())
                e2eRunId = run.testRunId
                e2eState = E2eSyncState.PENDING
                e2eResultMessage = "Test transaction generated; preparing authenticated upload."
                scope.launch {
                    e2eState = E2eSyncState.UPLOADING
                    e2eResultMessage = "Uploading synthetic test transaction to the local E2E backend…"
                    try {
                        val response = withContext(Dispatchers.IO) { PairingApi.uploadE2e(credential.baseUrl, credential.token, run) }
                        when {
                            response.httpStatus == 201 -> {
                                e2eState = E2eSyncState.UPLOADED
                                e2eResultMessage = "Uploaded to the pending inbox as a TEST transaction. No expense or balance changed."
                            }
                            response.httpStatus == 200 && response.duplicate -> {
                                e2eState = E2eSyncState.DUPLICATE
                                e2eResultMessage = "The backend recognized this test run as a duplicate; no second inbox item was created."
                            }
                            else -> {
                                e2eState = E2eSyncState.FAILED
                                e2eResultMessage = response.safeMessage ?: "The local E2E backend rejected the test request (HTTP ${response.httpStatus})."
                            }
                        }
                        e2eBackendReady = runCatching {
                            withContext(Dispatchers.IO) { PairingApi.e2eStatus(credential.baseUrl, credential.token) }
                        }.getOrDefault(false)
                    } catch (_: Exception) {
                        e2eState = E2eSyncState.FAILED
                        e2eResultMessage = "Local E2E upload failed. Check the test backend and approved device status."
                        e2eBackendReady = false
                    }
                }
            }

            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    Column(
                        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text("Deposit Flow Companion", style = MaterialTheme.typography.headlineSmall)
                        Text("Pair this phone with your signed-in web account. Transaction candidates sync separately after owner approval.")
                        Text("Connection: ${pairingStatus.label()}", style = MaterialTheme.typography.titleMedium)

                        if (storedCredential == null || pairingStatus == PairingStatus.UNPAIRED || pairingStatus == PairingStatus.REVOKED) {
                            OutlinedTextField(
                                value = baseUrl,
                                onValueChange = { baseUrl = it },
                                label = { Text("Finance website URL") },
                                placeholder = { Text("https://your-app.vercel.app") },
                                singleLine = true,
                                enabled = !busy,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            OutlinedTextField(
                                value = deviceName,
                                onValueChange = { deviceName = it },
                                label = { Text("Phone name") },
                                singleLine = true,
                                enabled = !busy,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            OutlinedTextField(
                                value = pairingCode,
                                onValueChange = { pairingCode = it.uppercase().take(32) },
                                label = { Text("One-time pairing code") },
                                singleLine = true,
                                enabled = !busy,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Button(
                                enabled = !busy && pairingCode.isNotBlank() && deviceName.isNotBlank() && baseUrl.isNotBlank(),
                                onClick = {
                                    scope.launch {
                                        busy = true
                                        message = ""
                                        try {
                                            val origin = withContext(Dispatchers.IO) { PairingApi.validateBaseUrl(baseUrl) }
                                            val oldCredential = storedCredential
                                            val accountScopeChanged = oldCredential != null &&
                                                (pairingStatus == PairingStatus.REVOKED || origin != oldCredential.baseUrl)
                                            val token = if (accountScopeChanged || oldCredential == null) DeviceTokenFactory.create() else oldCredential.token
                                            val cleanName = deviceName.trim().take(80)
                                            val result = withContext(Dispatchers.IO) {
                                                PairingApi.claim(origin, pairingCode.trim(), cleanName, token)
                                            }
                                            if (accountScopeChanged) {
                                                withContext(Dispatchers.IO) { candidateRepository.clearQueue() }
                                                syncPreferences.clear()
                                            }
                                            withContext(Dispatchers.IO) { credentialStore.save(origin, cleanName, token) }
                                            storedCredential = credentialStore.load()
                                            baseUrl = origin
                                            pairingStatus = result.status
                                            message = if (result.duplicate) "Pairing request already received. Waiting for web approval." else "Pairing requested. Approve this phone from the web dashboard."
                                            pairingCode = ""
                                        } catch (error: Exception) {
                                            message = error.message ?: "Could not claim this pairing code. Check the URL and try again before it expires."
                                        } finally {
                                            busy = false
                                        }
                                    }
                                },
                                modifier = Modifier.fillMaxWidth(),
                            ) { Text(if (busy) "Pairing…" else "Request pairing") }
                        }

                        if (storedCredential != null) {
                            OutlinedButton(
                                enabled = !busy,
                                onClick = {
                                    val credential = storedCredential ?: return@OutlinedButton
                                    scope.launch {
                                        busy = true
                                        message = ""
                                        try {
                                            pairingStatus = withContext(Dispatchers.IO) { PairingApi.status(credential.baseUrl, credential.token) }
                                            if (pairingStatus == PairingStatus.ACTIVE) SyncScheduler.enqueue(applicationContext)
                                            message = "Connection status refreshed."
                                        } catch (error: Exception) {
                                            message = error.message ?: "Could not check device status."
                                        } finally { busy = false }
                                    }
                                },
                                modifier = Modifier.fillMaxWidth(),
                            ) { Text("Refresh connection status") }
                            Button(
                                enabled = !busy,
                                onClick = {
                                    val credential = storedCredential ?: return@Button
                                    scope.launch {
                                        busy = true
                                        message = ""
                                        try {
                                            pairingStatus = withContext(Dispatchers.IO) { PairingApi.disconnect(credential.baseUrl, credential.token) }
                                            withContext(Dispatchers.IO) { candidateRepository.clearQueue() }
                                            syncPreferences.clear()
                                            withContext(Dispatchers.IO) { credentialStore.clear() }
                                            storedCredential = null
                                            message = "Device disconnected and local credentials cleared."
                                        } catch (error: Exception) {
                                            message = "Could not confirm server disconnect. Use the dashboard to revoke this phone, then clear local credentials. ${error.message.orEmpty()}"
                                        } finally { busy = false }
                                    }
                                },
                                modifier = Modifier.fillMaxWidth(),
                            ) { Text("Disconnect from account") }
                            OutlinedButton(
                                enabled = !busy,
                                onClick = {
                                    scope.launch {
                                        withContext(Dispatchers.IO) { candidateRepository.clearQueue() }
                                        syncPreferences.clear()
                                        withContext(Dispatchers.IO) { credentialStore.clear() }
                                        storedCredential = null
                                        pairingStatus = PairingStatus.UNPAIRED
                                        message = "Local credentials cleared. This does not revoke the server device; revoke it from the web dashboard if needed."
                                    }
                                },
                                modifier = Modifier.fillMaxWidth(),
                            ) { Text("Clear local credentials") }
                        }

                        if (message.isNotBlank()) Text(message, color = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.height(8.dp))
                        Text("Capture sources", style = MaterialTheme.typography.titleLarge)
                        Text("RECEIVE_SMS permission: ${if (permissionGranted.value) "Granted" else "Not granted"}")
                        if (!permissionGranted.value) {
                            OutlinedButton(onClick = { permissionLauncher.launch(Manifest.permission.RECEIVE_SMS) }) {
                                Text("Request RECEIVE_SMS permission")
                            }
                        }
                        if (BuildConfig.DEBUG) {
                            androidx.compose.foundation.layout.Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                                Switch(
                                    checked = emulatorTestingEnabled,
                                    enabled = permissionGranted.value,
                                    onCheckedChange = { enabled ->
                                        captureSettings.setEmulatorSmsTestingEnabled(enabled)
                                        emulatorTestingEnabled = captureSettings.emulatorSmsTestingEnabled()
                                    },
                                )
                                Column {
                                    Text("Enable emulator SMS testing")
                                    Text("Debug build only · sender (650) 555-1212 · candidates are synthetic and local-only", style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }
                        Text("Enable only the bank sender IDs you recognize. SMS bodies from other senders are discarded before parsing.", style = MaterialTheme.typography.bodySmall)
                        CaptureSources.smsSources.forEach { source ->
                            androidx.compose.foundation.layout.Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                                Switch(
                                    checked = source.id in enabledSmsIds,
                                    onCheckedChange = { checked ->
                                        captureSettings.setSmsEnabled(source.id, checked)
                                        enabledSmsIds = captureSettings.enabledSmsIds()
                                    },
                                )
                                Text("${source.title} · ${source.senderIds.joinToString()}")
                            }
                        }

                        Spacer(Modifier.height(4.dp))
                        Text("Financial app notifications", style = MaterialTheme.typography.titleMedium)
                        Text("Notification access can see notifications system-wide. This app inspects content only from apps you select below.", style = MaterialTheme.typography.bodySmall)
                        Text("Notification access: ${if (notificationAccessGranted.value) "Enabled" else "Not enabled"}")
                        OutlinedButton(onClick = { startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) }) {
                            Text("Open notification access settings")
                        }
                        CaptureSources.notificationSources.forEach { source ->
                            androidx.compose.foundation.layout.Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                                Checkbox(
                                    checked = source.packageName in enabledNotificationPackages,
                                    onCheckedChange = { checked ->
                                        captureSettings.setNotificationEnabled(source.packageName, checked)
                                        enabledNotificationPackages = captureSettings.enabledNotificationPackages()
                                    },
                                )
                                Text(source.title)
                            }
                        }

                        Spacer(Modifier.height(8.dp))
                        Text("Detected transactions (${candidateCounts.total})", style = MaterialTheme.typography.titleLarge)
                        Text("Pending: ${candidateCounts.pending} · Possible duplicates: ${candidateCounts.possibleDuplicates} · Needs review: ${candidateCounts.needsReview}")
                        Text("Parser status: $parserStatus · local processing only. Raw message contents are discarded.", style = MaterialTheme.typography.bodySmall)
                        SmsDiagnosticsPanel(diagnostics, permissionGranted.value)
                        if (candidates.isEmpty()) Text("No transaction candidates detected yet.")
                        candidates.take(50).forEach { candidate -> CandidateCard(candidate) }

                        Spacer(Modifier.height(8.dp))
                        Text("Synchronization", style = MaterialTheme.typography.titleLarge)
                        Text("${if (syncPaused) "Paused" else "Running when online"} · queued ${syncCounts.queued} · uploading ${syncCounts.uploading} · synced ${syncCounts.synced} · failed ${syncCounts.failed} · local-only/review ${syncCounts.localOnly}")
                        Text("Last successful sync: ${lastSyncAt?.let { DateFormatForCandidate.format(Date(it)) } ?: "Not yet synced"}")
                        syncWarning?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                        androidx.compose.foundation.layout.Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                            Switch(
                                checked = transactionNotificationsEnabled,
                                onCheckedChange = { enabled ->
                                    notificationPreferences.setEnabled(enabled)
                                    transactionNotificationsEnabled = enabled
                                    if (!enabled) {
                                        scope.launch { withContext(Dispatchers.IO) { candidateRepository.suppressPendingNotifications() } }
                                    } else if (Build.VERSION.SDK_INT >= 33 && !TransactionNotificationPublisher.hasPermission(this@MainActivity)) {
                                        postNotificationsLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                                    } else {
                                        SyncScheduler.enqueue(applicationContext)
                                    }
                                },
                            )
                            Column {
                                Text("Transaction notifications")
                                Text("Only new production inbox inserts (HTTP 201); duplicates and local test items are excluded.", style = MaterialTheme.typography.bodySmall)
                            }
                        }
                        Text("Notification permission: ${if (postNotificationsGranted.value) "Allowed" else "Not allowed"}")
                        if (transactionNotificationsEnabled && !postNotificationsGranted.value && Build.VERSION.SDK_INT >= 33) {
                            OutlinedButton(onClick = { postNotificationsLauncher.launch(Manifest.permission.POST_NOTIFICATIONS) }) {
                                Text("Allow transaction notifications")
                            }
                        }
                        if (BuildConfig.DEBUG) {
                            androidx.compose.material3.Card(modifier = Modifier.fillMaxWidth()) {
                                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text("Development-only end-to-end test", style = MaterialTheme.typography.titleMedium)
                                    Text("Test backend: ${if (e2eBackendReady) "local and enabled" else "not connected or not enabled"}")
                                    Text("E2E sync result: ${e2eState.name.lowercase().replaceFirstChar { it.uppercase() }}")
                                    e2eRunId?.let { Text("Test run: $it", style = MaterialTheme.typography.bodySmall) }
                                    Text(e2eResultMessage, style = MaterialTheme.typography.bodySmall)
                                    OutlinedButton(
                                        enabled = !busy && e2eState != E2eSyncState.UPLOADING && E2eTestPolicy.canRun(
                                            BuildConfig.DEBUG,
                                            storedCredential?.baseUrl.orEmpty(),
                                            pairingStatus == PairingStatus.ACTIVE,
                                            e2eBackendReady,
                                        ),
                                        onClick = { showE2eConfirmation = true },
                                    ) { Text("Run E2E Sync Test") }
                                    Text("Generates one synthetic ₹2.50 debit. It uses a fresh test ID and stays marked TEST in the local pending inbox.", style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }
                        androidx.compose.foundation.layout.Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick = {
                                syncPreferences.setPaused(!syncPaused)
                                if (syncPaused) SyncScheduler.enqueue(applicationContext)
                                syncPaused = syncPreferences.isPaused()
                            }) { Text(if (syncPaused) "Resume sync" else "Pause sync") }
                            Button(onClick = {
                                scope.launch {
                                    withContext(Dispatchers.IO) { candidateRepository.retryFailed() }
                                    syncPreferences.setPaused(false)
                                    syncPreferences.setWarning(null)
                                    syncPaused = false
                                    syncWarning = null
                                    SyncScheduler.enqueue(applicationContext)
                                }
                            }, enabled = !busy) { Text("Retry Sync") }
                        }
                        if (failedCandidates.isNotEmpty()) {
                            Text("Failed items", style = MaterialTheme.typography.titleMedium)
                            failedCandidates.forEach { item ->
                                Column(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                                    Text("${item.candidate.transactionType} · ${NumberFormat.getCurrencyInstance(Locale("en", "IN")).format(item.candidate.amountMinor / 100.0)}")
                                    Text(item.syncError.orEmpty(), style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }
                        Text("Disconnecting or clearing local credentials also clears the local candidate queue to prevent cross-account uploads.", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            if (showE2eConfirmation) {
                AlertDialog(
                    onDismissRequest = { showE2eConfirmation = false },
                    title = { Text("Run isolated E2E test?") },
                    text = { Text("This sends a synthetic ₹2.50 debit only to http://10.0.2.2:3000 using this emulator's approved test device. It does not make a payment and will not use the production Vercel backend. Confirm to upload it to the local test inbox.") },
                    confirmButton = {
                        Button(onClick = { showE2eConfirmation = false; executeE2eTest() }) { Text("Upload test transaction") }
                    },
                    dismissButton = { OutlinedButton(onClick = { showE2eConfirmation = false }) { Text("Cancel") } },
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        permissionGranted.value = hasSmsPermission()
        notificationAccessGranted.value = hasNotificationAccess()
        postNotificationsGranted.value = TransactionNotificationPublisher.hasPermission(this)
        if (postNotificationsGranted.value) SyncScheduler.enqueue(applicationContext)
    }

    private fun hasSmsPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED

    private fun hasNotificationAccess(): Boolean {
        val enabled = Settings.Secure.getString(contentResolver, "enabled_notification_listeners").orEmpty()
        return enabled.split(':').any { ComponentName.unflattenFromString(it)?.packageName == packageName }
    }

}

@androidx.compose.runtime.Composable
private fun CandidateCard(candidate: TransactionCandidate) {
    androidx.compose.material3.Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            val amount = NumberFormat.getCurrencyInstance(Locale("en", "IN")).format(candidate.amountMinor / 100.0)
            val label = when {
                candidate.isSynthetic -> " · SYNTHETIC TEST"
                candidate.status == CandidateStatus.NEEDS_REVIEW || candidate.transactionType == com.depositflow.smsprobe.data.local.TransactionType.UNKNOWN -> " · NEEDS REVIEW"
                else -> ""
            }
            Text("$amount · ${candidate.transactionType}$label", style = MaterialTheme.typography.titleMedium)
            Text(listOfNotNull(candidate.bank, candidate.transactionMode.takeIf { it != com.depositflow.smsprobe.data.local.TransactionMode.OTHER }?.name, candidate.merchant).joinToString(" · "))
            candidate.accountSuffix?.let { Text("Account ending ·••••$it", style = MaterialTheme.typography.bodySmall) }
            Text("${candidate.source} · ${DateFormatForCandidate.format(Date(candidate.transactionTimestamp))}", style = MaterialTheme.typography.bodySmall)
            if (candidate.status == CandidateStatus.POSSIBLE_DUPLICATE) {
                Text("Possible duplicate — both records are retained for your review.", color = MaterialTheme.colorScheme.error)
            }
            if (candidate.status == CandidateStatus.NEEDS_REVIEW || candidate.transactionType == com.depositflow.smsprobe.data.local.TransactionType.UNKNOWN) {
                Text("Direction or transaction details are uncertain. This candidate stays encrypted on this device and is not synchronized.", color = MaterialTheme.colorScheme.error)
            }
        }
    }
}

@androidx.compose.runtime.Composable
private fun SmsDiagnosticsPanel(diagnostics: CaptureDiagnostics, permissionGranted: Boolean) {
    androidx.compose.material3.Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text("SMS diagnostics", style = MaterialTheme.typography.titleMedium)
            Text("RECEIVE_SMS: ${if (permissionGranted) "granted" else "not granted"}")
            Text("Broadcasts ${diagnostics.counts[SmsOutcome.BROADCAST_RECEIVED] ?: 0} · sender rejected ${diagnostics.counts[SmsOutcome.SENDER_REJECTED] ?: 0} · parser rejected ${diagnostics.counts[SmsOutcome.PARSER_REJECTED] ?: 0} · detected ${diagnostics.counts[SmsOutcome.TRANSACTION_DETECTED] ?: 0} · review ${diagnostics.counts[SmsOutcome.REVIEW_REQUIRED] ?: 0} · synthetic ${diagnostics.counts[SmsOutcome.SYNTHETIC_DETECTED] ?: 0}")
            Text("Last result: ${diagnostics.lastOutcome?.label ?: "No SMS broadcast received"}${diagnostics.lastAt?.let { " · ${DateFormatForCandidate.format(Date(it))}" }.orEmpty()}", style = MaterialTheme.typography.bodySmall)
            Text("Diagnostics store only generic outcomes and times. Message contents and sender numbers are never saved or logged.", style = MaterialTheme.typography.bodySmall)
        }
    }
}

private object DateFormatForCandidate {
    @Synchronized fun format(date: Date): String = SimpleDateFormat("dd MMM yyyy, HH:mm", Locale.getDefault()).format(date)
}

private fun PairingStatus.label(): String = when (this) {
    PairingStatus.UNPAIRED -> "Not paired"
    PairingStatus.CHECKING -> "Checking…"
    PairingStatus.PENDING -> "Pending owner approval"
    PairingStatus.ACTIVE -> "Approved and connected"
    PairingStatus.REVOKED -> "Revoked"
    PairingStatus.UNKNOWN -> "Unknown; refresh status"
}
