package com.depositflow.smsprobe.security

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DeviceCredentialStoreTest {
    @Test fun encryptsTokenAtRestLoadsItAndClearsCiphertext() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val store = DeviceCredentialStore(context)
        val token = DeviceTokenFactory.create()
        store.clear()

        store.save("https://finance.example", "Samsung phone", token)
        assertEquals(token, store.load()?.token)
        val persistedValues = context.getSharedPreferences("device_credentials", Context.MODE_PRIVATE).all.values
        assertFalse(persistedValues.contains(token))

        store.clear()
        assertNull(store.load())
        assertEquals(0, context.getSharedPreferences("device_credentials", Context.MODE_PRIVATE).all.size)
    }
}
