package com.depositflow.smsprobe.security

import java.security.SecureRandom
import java.util.Base64

object DeviceTokenFactory {
    fun create(): String {
        val bytes = ByteArray(32).also(SecureRandom()::nextBytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }
}
