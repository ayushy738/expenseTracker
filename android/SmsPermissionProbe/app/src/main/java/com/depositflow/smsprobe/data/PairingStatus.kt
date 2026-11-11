package com.depositflow.smsprobe.data

enum class PairingStatus {
    UNPAIRED,
    CHECKING,
    PENDING,
    ACTIVE,
    REVOKED,
    UNKNOWN;

    companion object {
        fun fromApi(value: String?): PairingStatus = when (value?.uppercase()) {
            "PENDING" -> PENDING
            "ACTIVE" -> ACTIVE
            "REVOKED" -> REVOKED
            else -> UNKNOWN
        }
    }
}
