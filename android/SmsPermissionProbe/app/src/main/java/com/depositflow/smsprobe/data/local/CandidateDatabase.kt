package com.depositflow.smsprobe.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(entities = [CandidateEntity::class], version = 2, exportSchema = false)
abstract class CandidateDatabase : RoomDatabase() {
    abstract fun candidateDao(): CandidateDao

    companion object {
        @Volatile private var instance: CandidateDatabase? = null

        fun get(context: Context): CandidateDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, CandidateDatabase::class.java, "local_candidates.db")
                .addMigrations(MIGRATION_1_2)
                .build().also { instance = it }
        }

        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE transaction_candidates ADD COLUMN syncState TEXT NOT NULL DEFAULT 'QUEUED'")
                db.execSQL("ALTER TABLE transaction_candidates ADD COLUMN syncStartedAt INTEGER")
                db.execSQL("ALTER TABLE transaction_candidates ADD COLUMN syncAttempts INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE transaction_candidates ADD COLUMN syncError TEXT")
            }
        }
    }
}
