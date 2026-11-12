import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { DepositModel } from "../models/Deposit";
import { ExpenseModel } from "../models/Expense";
import { BankTransactionModel } from "../models/BankTransaction";
import { DeviceModel } from "../models/Device";
import { DevicePairingChallengeModel } from "../models/DevicePairingChallenge";
import { createDeviceToken, hashDeviceToken } from "../lib/device-token";
import { UserModel } from "../models/User";
import { UserSessionModel } from "../models/UserSession";
import { createOpaqueToken, digestToken } from "../lib/auth-crypto";
import { hashSecret } from "../lib/auth-crypto";
import { AuthThrottleModel } from "../models/AuthThrottle";
import { takeAuthAttempt } from "../lib/auth-throttle";

let repl: MongoMemoryReplSet;
let confirmRequest: typeof import("../app/api/bank-transactions/[id]/route").POST;
let smsRequest: typeof import("../app/api/sms/route").POST;
let e2eStatusRequest: typeof import("../app/api/sms/e2e-status/route").GET;
let manualExpenseRequest: typeof import("../app/api/expenses/route").POST;
let manualDepositRequest: typeof import("../app/api/deposits/route").POST;
let updateDepositRequest: typeof import("../app/api/deposits/[id]/route").PATCH;
let deleteDepositRequest: typeof import("../app/api/deposits/[id]/route").DELETE;
let listDepositRequest: typeof import("../app/api/deposits/route").GET;
let listExpenseRequest: typeof import("../app/api/expenses/route").GET;
let registerRequest: typeof import("../app/api/auth/register/route").POST;
let loginRequest: typeof import("../app/api/auth/login/route").POST;
let logoutRequest: typeof import("../app/api/auth/logout/route").POST;
let pinSetupRequest: typeof import("../app/api/auth/pin/route").PUT;
let pinUnlockRequest: typeof import("../app/api/auth/pin/unlock/route").POST;
let changePasswordRequest: typeof import("../app/api/auth/password/route").PUT;
let revokeDeviceRequest: typeof import("../app/api/devices/[id]/route").DELETE;
let updateDeviceRequest: typeof import("../app/api/devices/[id]/route").PATCH;
let devicesRequest: typeof import("../app/api/devices/route").POST;
let claimDeviceRequest: typeof import("../app/api/device-pairings/claim/route").POST;
let deviceStatusRequest: typeof import("../app/api/device/status/route").GET;
let deviceDisconnectRequest: typeof import("../app/api/device/disconnect/route").POST;
let ownerId: mongoose.Types.ObjectId;
let authHeaders: Record<string, string>;

before(async () => {
  process.env.MONGOMS_DOWNLOAD_DIR ??= `${process.cwd()}/.cache/mongodb-binaries`;
  process.env.MONGOMS_VERSION ??= "7.0.16";
  const systemBinary = `${process.env.MONGOMS_DOWNLOAD_DIR}/mongodb-win32-x86_64-windows-7.0.16/bin/mongod.exe`;
  if (!process.env.MONGOMS_SYSTEM_BINARY && existsSync(systemBinary)) process.env.MONGOMS_SYSTEM_BINARY = systemBinary;
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = repl.getUri("finance_integration_e2e");
  process.env.MONGODB_DB = "finance_integration_e2e";
  process.env.PIN_PEPPER = "integration-test-pepper-must-be-longer-than-32-chars";
  ({ POST: confirmRequest } = await import("../app/api/bank-transactions/[id]/route"));
  ({ POST: smsRequest } = await import("../app/api/sms/route"));
  ({ GET: e2eStatusRequest } = await import("../app/api/sms/e2e-status/route"));
  ({ POST: manualExpenseRequest } = await import("../app/api/expenses/route"));
  ({ POST: manualDepositRequest } = await import("../app/api/deposits/route"));
  ({ PATCH: updateDepositRequest, DELETE: deleteDepositRequest } = await import("../app/api/deposits/[id]/route"));
  ({ GET: listDepositRequest } = await import("../app/api/deposits/route"));
  ({ GET: listExpenseRequest } = await import("../app/api/expenses/route"));
  ({ POST: registerRequest } = await import("../app/api/auth/register/route"));
  ({ POST: loginRequest } = await import("../app/api/auth/login/route"));
  ({ POST: logoutRequest } = await import("../app/api/auth/logout/route"));
  ({ PUT: pinSetupRequest } = await import("../app/api/auth/pin/route"));
  ({ POST: pinUnlockRequest } = await import("../app/api/auth/pin/unlock/route"));
  ({ PUT: changePasswordRequest } = await import("../app/api/auth/password/route"));
  ({ DELETE: revokeDeviceRequest } = await import("../app/api/devices/[id]/route"));
  ({ PATCH: updateDeviceRequest } = await import("../app/api/devices/[id]/route"));
  ({ POST: devicesRequest } = await import("../app/api/devices/route"));
  ({ POST: claimDeviceRequest } = await import("../app/api/device-pairings/claim/route"));
  ({ GET: deviceStatusRequest } = await import("../app/api/device/status/route"));
  ({ POST: deviceDisconnectRequest } = await import("../app/api/device/disconnect/route"));
  await mongoose.connect(process.env.MONGODB_URI);
  await Promise.all([UserModel.init(), UserSessionModel.init(), AuthThrottleModel.init(), DepositModel.init(), ExpenseModel.init(), BankTransactionModel.init(), DeviceModel.init(), DevicePairingChallengeModel.init()]);
});

after(async () => {
  await mongoose.disconnect();
  await repl?.stop();
});

beforeEach(async () => {
  await Promise.all([DepositModel.deleteMany({}), ExpenseModel.deleteMany({}), BankTransactionModel.deleteMany({}), DeviceModel.deleteMany({}), DevicePairingChallengeModel.deleteMany({}), UserSessionModel.deleteMany({}), UserModel.deleteMany({}), AuthThrottleModel.deleteMany({})]);
  const owner = await UserModel.create({ name: "Owner", email: `owner-${crypto.randomUUID()}@test.local`, passwordHash: await hashSecret("CorrectHorse12") });
  ownerId = owner._id;
  const token = createOpaqueToken();
  await UserSessionModel.create({ userId: ownerId, tokenHash: digestToken(token), expiresAt: new Date(Date.now() + 86_400_000), pinUnlockedUntil: new Date(Date.now() + 86_400_000) });
  authHeaders = { cookie: `finance_session=${token}; finance_csrf=test-csrf`, "x-csrf-token": "test-csrf", origin: "https://local.test", host: "local.test", "x-forwarded-proto": "https" };
});

async function deposit(remainingAmount: number) {
  return DepositModel.create({ userId: ownerId, depositId: "DEP-001", amount: remainingAmount, source: "Test", savingsAmount: 0, spendableAmount: remainingAmount, remainingAmount, spentAmount: 0 });
}

async function currentDeposit() {
  return await DepositModel.findOne({ userId: ownerId, depositId: "DEP-001" }).lean() as unknown as { amount: number; savingsAmount: number; spentAmount: number; remainingAmount: number } | null;
}

async function currentTransaction(id: unknown) {
  return await BankTransactionModel.findById(id).lean() as unknown as { status: string; history?: Array<{ action: string; reason?: string; snapshot?: { amount: number } }> } | null;
}

async function importedTransaction(amount: number, fingerprint = `fp-${crypto.randomUUID()}`) {
  const device = await DeviceModel.create({ userId: ownerId, name: "Integration", tokenHash: hashDeviceToken(createDeviceToken()), status: "ACTIVE" });
  return BankTransactionModel.create({ userId: ownerId, amount, transactionType: "DEBIT", merchant: "Test merchant", timestamp: new Date(), deviceId: device._id, fingerprint, status: "PENDING" });
}

async function confirm(id: unknown) {
  return confirmRequest(new Request(`https://local.test/api/bank-transactions/${id}`, {
    method: "POST", headers: { ...authHeaders, "content-type": "application/json" }, body: JSON.stringify({ action: "confirm", depositId: "DEP-001", category: "Other" })
  }), { params: Promise.resolve({ id: String(id) }) });
}

async function startPairing() {
  const response = await devicesRequest(new Request("https://local.test/api/devices", {
    method: "POST", headers: { ...authHeaders, "content-type": "application/json" }, body: JSON.stringify({})
  }));
  return { response, body: await response.json() as { code: string; expiresAt: string } };
}

function claimPairing(code: string, deviceToken = createDeviceToken(), deviceName = "Samsung") {
  return {
    deviceToken,
    request: () => claimDeviceRequest(new Request("https://local.test/api/device-pairings/claim", {
      method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.50" },
      body: JSON.stringify({ code, deviceName, deviceToken })
    }))
  };
}

test("simultaneous confirmation of one bank transaction creates one expense and charges once", async () => {
  await deposit(100);
  const transaction = await importedTransaction(60);
  const responses = await Promise.all([confirm(transaction._id), confirm(transaction._id)]);
  assert.ok(responses.every((response) => response.ok));
  assert.equal(await ExpenseModel.countDocuments({ bankTransactionId: transaction._id }), 1);
  const storedDeposit = await currentDeposit();
  assert.equal(storedDeposit?.remainingAmount, 40);
  assert.equal(storedDeposit?.spentAmount, 60);
});

test("different transactions competing for insufficient remaining balance allow only one confirmation", async () => {
  await deposit(100);
  const first = await importedTransaction(80);
  const second = await importedTransaction(80);
  const responses = await Promise.all([confirm(first._id), confirm(second._id)]);
  assert.equal(responses.filter((response) => response.ok).length, 1);
  assert.equal(await ExpenseModel.countDocuments(), 1);
  const storedDeposit = await currentDeposit();
  assert.equal(storedDeposit?.remainingAmount, 20);
  assert.equal(storedDeposit?.spentAmount, 80);
});

test("expense creation failure rolls back transaction status and reserved deposit balance", async () => {
  await deposit(100);
  const transaction = await importedTransaction(30);
  const originalCreate = ExpenseModel.create;
  ExpenseModel.create = (async () => { throw new Error("injected expense write failure"); }) as typeof ExpenseModel.create;
  try { await assert.rejects(() => confirm(transaction._id), /injected expense write failure/); }
  finally { ExpenseModel.create = originalCreate; }
  assert.equal((await currentTransaction(transaction._id))?.status, "PENDING");
  assert.equal((await currentDeposit())?.remainingAmount, 100);
  assert.equal(await ExpenseModel.countDocuments({ userId: ownerId }), 0);
});

test("deposit recalculation failure rolls back expense, transaction, and balance writes", async () => {
  await deposit(100);
  const transaction = await importedTransaction(30);
  const originalSave = DepositModel.prototype.save;
  DepositModel.prototype.save = (async () => { throw new Error("injected deposit recalculation failure"); }) as typeof DepositModel.prototype.save;
  try { await assert.rejects(() => confirm(transaction._id), /injected deposit recalculation failure/); }
  finally { DepositModel.prototype.save = originalSave; }
  assert.equal((await currentTransaction(transaction._id))?.status, "PENDING");
  assert.equal((await currentDeposit())?.remainingAmount, 100);
  assert.equal(await ExpenseModel.countDocuments(), 0);
});

test("duplicate ingestion returns existing item; retries do not create another record; revocation blocks later uploads", async () => {
  const rawToken = createDeviceToken();
  const device = await DeviceModel.create({ userId: ownerId, name: "Phone", tokenHash: hashDeviceToken(rawToken), status: "ACTIVE" });
  const input = { amount: 12.5, transactionType: "DEBIT", bank: "Example", reference: "R-1", merchant: "Shop", timestamp: new Date().toISOString() };
  const upload = () => smsRequest(new Request("https://local.test/api/sms", {
    method: "POST", headers: { ...authHeaders, "content-type": "application/json", authorization: `Bearer ${rawToken}`, "x-device-timestamp": String(Date.now()) }, body: JSON.stringify(input)
  }));
  const first = await upload();
  const retry = await upload();
  assert.equal(first.status, 201);
  assert.equal((await retry.json()).duplicate, true);
  assert.equal(await BankTransactionModel.countDocuments(), 1);
  await DeviceModel.updateOne({ _id: device._id }, { $set: { revokedAt: new Date() } });
  assert.equal((await upload()).status, 401);
  assert.equal(await BankTransactionModel.countDocuments(), 1);
});

test("captureId retries are idempotent, concurrent, owner/device scoped, and legacy clients still work", async () => {
  const firstToken = createDeviceToken();
  const firstDevice = await DeviceModel.create({ userId: ownerId, name: "First phone", tokenHash: hashDeviceToken(firstToken), status: "ACTIVE" });
  const captureId = crypto.randomUUID();
  const upload = (token: string, payload: object) => smsRequest(new Request("https://local.test/api/sms", {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-device-timestamp": String(Date.now()) }, body: JSON.stringify(payload)
  }));
  const payload = { captureId, amount: 45.5, transactionType: "DEBIT", bank: "Example", timestamp: new Date().toISOString() };
  const [first, concurrent] = await Promise.all([upload(firstToken, payload), upload(firstToken, payload)]);
  assert.deepEqual([first.status, concurrent.status].sort(), [200, 201]);
  assert.equal(await BankTransactionModel.countDocuments({ userId: ownerId, deviceId: firstDevice._id, captureId }), 1);
  const retry = await upload(firstToken, payload);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).duplicate, true);

  const secondToken = createDeviceToken();
  const secondDevice = await DeviceModel.create({ userId: ownerId, name: "Second phone", tokenHash: hashDeviceToken(secondToken), status: "ACTIVE" });
  assert.equal((await upload(secondToken, { ...payload, amount: 45.51 })).status, 201);
  assert.equal(await BankTransactionModel.countDocuments({ userId: ownerId, captureId }), 2);

  const other = await UserModel.create({ name: "Other", email: `capture-${crypto.randomUUID()}@test.local`, passwordHash: await hashSecret("CorrectHorse12") });
  const otherToken = createDeviceToken();
  const otherDevice = await DeviceModel.create({ userId: other._id, name: "Other phone", tokenHash: hashDeviceToken(otherToken), status: "ACTIVE" });
  const isolatedPayload = { ...payload, amount: 45.51 };
  assert.equal((await upload(otherToken, isolatedPayload)).status, 201);
  assert.equal(await BankTransactionModel.countDocuments({ userId: other._id, deviceId: otherDevice._id, captureId }), 1);
  assert.equal(await BankTransactionModel.countDocuments({ captureId }), 3);
});

test("local E2E ingestion requires dev mode, approved owner device, and stays test-labeled through one-time confirmation", async () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    enabled: process.env.E2E_TEST_MODE,
    email: process.env.E2E_TEST_USER_EMAIL,
  };
  mutableEnv.NODE_ENV = "development";
  process.env.E2E_TEST_MODE = "true";
  const owner = await UserModel.findById(ownerId).lean() as unknown as { email: string };
  process.env.E2E_TEST_USER_EMAIL = owner.email;
  try {
    const rawToken = createDeviceToken();
    const device = await DeviceModel.create({ userId: ownerId, name: "Dedicated E2E emulator", tokenHash: hashDeviceToken(rawToken), status: "ACTIVE" });
    const captureId = crypto.randomUUID();
    const testRunId = crypto.randomUUID();
    const payload = {
      captureId,
      testRunId,
      isTest: true,
      amount: 2.5,
      transactionType: "DEBIT",
      bank: "E2E TEST",
      merchant: "E2E TESTSTORE",
      reference: `E2E-${testRunId}`,
      timestamp: new Date().toISOString(),
    };
    const upload = (token = rawToken) => smsRequest(new Request("https://local.test/api/sms", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-device-timestamp": String(Date.now()), "x-deposit-flow-e2e": "1" },
      body: JSON.stringify(payload),
    }));

    const statusResponse = await e2eStatusRequest(new Request("https://local.test/api/sms/e2e-status", {
      headers: { authorization: `Bearer ${rawToken}`, "x-device-timestamp": String(Date.now()) },
    }));
    assert.equal(statusResponse.status, 200);
    assert.equal((await statusResponse.json()).enabled, true);

    const first = await upload();
    assert.equal(first.status, 201);
    const firstBody = await first.json() as { id: string; status: string; duplicate: boolean };
    assert.equal(firstBody.status, "PENDING");
    assert.equal(firstBody.duplicate, false);
    const retry = await upload();
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).duplicate, true);
    assert.equal(await BankTransactionModel.countDocuments({ userId: ownerId, deviceId: device._id, isTest: true, testRunId }), 1);
    assert.equal(await BankTransactionModel.countDocuments({ isTest: false }), 0);

    await deposit(100);
    const confirmed = await confirm(firstBody.id);
    const repeatedConfirm = await confirm(firstBody.id);
    assert.equal(confirmed.status, 200);
    assert.equal(repeatedConfirm.status, 200);
    assert.equal((await repeatedConfirm.json()).alreadyConfirmed, true);
    assert.equal(await ExpenseModel.countDocuments({ bankTransactionId: firstBody.id }), 1);
    assert.equal((await currentDeposit())?.remainingAmount, 97.5);
    const stored = await BankTransactionModel.findById(firstBody.id).lean() as unknown as { isTest: boolean };
    assert.equal(stored.isTest, true);
    const testExpense = await ExpenseModel.findOne({ bankTransactionId: firstBody.id }).lean() as unknown as { isTest: boolean };
    assert.equal(testExpense.isTest, true);

    const correction = await confirmRequest(new Request("https://local.test/api/bank-transactions", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ action: "correct", reason: "E2E test correction check", amount: 2.5, merchant: "E2E TESTSTORE", category: "Other" }),
    }), { params: Promise.resolve({ id: firstBody.id }) });
    assert.equal(correction.status, 200);
    const replacement = await BankTransactionModel.findOne({ supersedesTransactionId: firstBody.id }).lean() as unknown as { isTest: boolean; testRunId: string; captureId: string };
    assert.equal(replacement.isTest, true);
    assert.ok(replacement.testRunId);
    assert.ok(replacement.captureId);

    const other = await UserModel.create({ name: "Other", email: `other-${crypto.randomUUID()}@test.local`, passwordHash: await hashSecret("CorrectHorse12") });
    const otherToken = createDeviceToken();
    await DeviceModel.create({ userId: other._id, name: "Other emulator", tokenHash: hashDeviceToken(otherToken), status: "ACTIVE" });
    assert.equal((await upload(otherToken)).status, 403);
    assert.equal((await e2eStatusRequest(new Request("https://local.test/api/sms/e2e-status", {
      headers: { authorization: `Bearer ${otherToken}`, "x-device-timestamp": String(Date.now()) },
    }))).status, 403);

    await DeviceModel.updateOne({ _id: device._id }, { $set: { status: "REVOKED", revokedAt: new Date() } });
    assert.equal((await upload()).status, 401);
    assert.equal((await e2eStatusRequest(new Request("https://local.test/api/sms/e2e-status", {
      headers: { authorization: `Bearer ${rawToken}`, "x-device-timestamp": String(Date.now()) },
    }))).status, 401);
    const noToken = await smsRequest(new Request("https://local.test/api/sms", {
      method: "POST", headers: { "content-type": "application/json", "x-deposit-flow-e2e": "1" }, body: JSON.stringify(payload),
    }));
    assert.equal(noToken.status, 401);
  } finally {
    if (previous.nodeEnv === undefined) delete mutableEnv.NODE_ENV; else mutableEnv.NODE_ENV = previous.nodeEnv;
    if (previous.enabled === undefined) delete process.env.E2E_TEST_MODE; else process.env.E2E_TEST_MODE = previous.enabled;
    if (previous.email === undefined) delete process.env.E2E_TEST_USER_EMAIL; else process.env.E2E_TEST_USER_EMAIL = previous.email;
  }
});

test("production rejects E2E-marked ingestion before any database operation", async () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousEnabled = process.env.E2E_TEST_MODE;
  mutableEnv.NODE_ENV = "production";
  process.env.E2E_TEST_MODE = "true";
  try {
    const response = await smsRequest(new Request("https://local.test/api/sms", {
      method: "POST", headers: { "content-type": "application/json", "x-deposit-flow-e2e": "1" }, body: "{}",
    }));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "E2E_DISABLED");
  } finally {
    if (previousNodeEnv === undefined) delete mutableEnv.NODE_ENV; else mutableEnv.NODE_ENV = previousNodeEnv;
    if (previousEnabled === undefined) delete process.env.E2E_TEST_MODE; else process.env.E2E_TEST_MODE = previousEnabled;
  }
});

test("correction and reversal preserve history and recalculate deposit without deleting imported expense", async () => {
  await deposit(100);
  const transaction = await importedTransaction(30);
  assert.equal((await confirm(transaction._id)).status, 200);
  const correctResponse = await confirmRequest(new Request("https://local.test", {
    method: "POST", headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({ action: "correct", reason: "Wrong amount from alert", amount: 25, merchant: "Corrected shop", category: "Food" })
  }), { params: Promise.resolve({ id: String(transaction._id) }) });
  assert.equal(correctResponse.status, 200);
  const original = await currentTransaction(transaction._id);
  assert.equal(original?.status, "REVERSED");
  assert.equal(original?.history?.[1]?.action, "CORRECTED");
  assert.equal(await ExpenseModel.countDocuments({ bankTransactionId: transaction._id, isReversed: true }), 1);
  assert.equal((await currentDeposit())?.remainingAmount, 100);
  assert.equal(await BankTransactionModel.countDocuments({ supersedesTransactionId: transaction._id, status: "PENDING" }), 1);

  const replacement = await BankTransactionModel.findOne({ supersedesTransactionId: transaction._id }) as unknown as { _id: mongoose.Types.ObjectId } | null;
  assert.ok(replacement);
  assert.equal((await confirm(replacement!._id)).status, 200);
  assert.equal((await currentDeposit())?.remainingAmount, 75);
  const reverseResponse = await confirmRequest(new Request("https://local.test", {
    method: "POST", headers: { ...authHeaders, "content-type": "application/json" }, body: JSON.stringify({ action: "reverse", reason: "Not a real purchase" })
  }), { params: Promise.resolve({ id: String(replacement._id) }) });
  assert.equal(reverseResponse.status, 200);
  assert.equal((await currentDeposit())?.remainingAmount, 100);
  assert.equal(await ExpenseModel.countDocuments({ isReversed: true }), 2);
});

test("manual expense route still creates a deposit-linked expense and updates the balance", async () => {
  await deposit(100);
  const response = await manualExpenseRequest(new Request("https://local.test/api/expenses", {
    method: "POST", headers: { ...authHeaders, "content-type": "application/json" }, body: JSON.stringify({ amount: 20, depositId: "DEP-001", category: "Food", description: "Manual" })
  }));
  assert.equal(response.status, 201);
  assert.equal(await ExpenseModel.countDocuments({ bankTransactionId: { $exists: false }, depositId: "DEP-001" }), 1);
  assert.equal((await currentDeposit())?.remainingAmount, 80);
});

test("manual expense route rejects a deposit owned by another account", async () => {
  const other = await UserModel.create({ name: "Other", email: `other-${crypto.randomUUID()}@test.local`, passwordHash: await hashSecret("CorrectHorse12") });
  await DepositModel.create({ userId: other._id, depositId: "DEP-OTHER", amount: 100, source: "Other account", savingsAmount: 0, spendableAmount: 100, remainingAmount: 100, spentAmount: 0 });
  const response = await manualExpenseRequest(new Request("https://local.test/api/expenses", {
    method: "POST", headers: { ...authHeaders, "content-type": "application/json" }, body: JSON.stringify({ amount: 20, depositId: "DEP-OTHER", category: "Food" })
  }));
  assert.equal(response.status, 404);
  assert.equal(await ExpenseModel.countDocuments(), 0);
  assert.equal((await DepositModel.findOne({ userId: other._id, depositId: "DEP-OTHER" }))?.remainingAmount, 100);
});

test("manual expense route rejects an amount above the selected deposit's remaining balance", async () => {
  await deposit(15);
  const response = await manualExpenseRequest(new Request("https://local.test/api/expenses", {
    method: "POST", headers: { ...authHeaders, "content-type": "application/json" }, body: JSON.stringify({ amount: "15.01", depositId: "DEP-001", category: "Food" })
  }));
  assert.equal(response.status, 400);
  assert.equal(await ExpenseModel.countDocuments(), 0);
  assert.equal((await currentDeposit())?.remainingAmount, 15);
});

test("manual expense route requires an unlocked PIN session and CSRF token", async () => {
  await deposit(100);
  const sessionToken = authHeaders.cookie.split(";")[0].split("=")[1];
  await UserSessionModel.updateOne({ tokenHash: digestToken(sessionToken) }, { pinUnlockedUntil: new Date(0) });
  const locked = await manualExpenseRequest(new Request("https://local.test/api/expenses", {
    method: "POST", headers: { ...authHeaders, "content-type": "application/json" }, body: JSON.stringify({ amount: 10, depositId: "DEP-001", category: "Food" })
  }));
  assert.equal(locked.status, 423);

  const unlockedSession = await UserSessionModel.findOne({ tokenHash: digestToken(sessionToken) });
  assert.ok(unlockedSession);
  unlockedSession!.pinUnlockedUntil = new Date(Date.now() + 60_000);
  await unlockedSession!.save();
  const withoutCsrf = await manualExpenseRequest(new Request("https://local.test/api/expenses", {
    method: "POST", headers: { cookie: authHeaders.cookie, origin: "https://local.test", host: "local.test", "x-forwarded-proto": "https", "content-type": "application/json" }, body: JSON.stringify({ amount: 10, depositId: "DEP-001", category: "Food" })
  }));
  assert.equal(withoutCsrf.status, 403);
  assert.equal(await ExpenseModel.countDocuments(), 0);
  assert.equal((await currentDeposit())?.remainingAmount, 100);
});

test("manual deposit creation and editing retain savings and balance calculations", async () => {
  const created = await manualDepositRequest(new Request("https://local.test/api/deposits", {
    method: "POST", headers: { ...authHeaders, "content-type": "application/json" }, body: JSON.stringify({ amount: 100, source: "Salary", savingsAmount: 20, userId: "000000000000000000000000" })
  }));
  assert.equal(created.status, 201);
  const first = await created.json();
  assert.equal(first.depositId, "DEP-001");
  assert.equal(first.spendableAmount, 80);
  assert.equal(first.remainingAmount, 80);
  assert.equal(String(first.userId), String(ownerId));

  const updated = await updateDepositRequest(new Request("https://local.test/api/deposits/DEP-001", {
    method: "PATCH", headers: { ...authHeaders, "content-type": "application/json" }, body: JSON.stringify({ amount: 120 })
  }), { params: Promise.resolve({ id: "DEP-001" }) });
  assert.equal(updated.status, 200);
  const finalDeposit = await currentDeposit();
  assert.equal(finalDeposit?.amount, 120);
  assert.equal(finalDeposit?.savingsAmount, 20);
  assert.equal(finalDeposit?.remainingAmount, 100);
});

test("deposit deletion keeps imported transaction reversal snapshot while preserving existing delete semantics", async () => {
  await deposit(100);
  const transaction = await importedTransaction(30);
  assert.equal((await confirm(transaction._id)).status, 200);
  const deleted = await deleteDepositRequest(new Request("https://local.test/api/deposits/DEP-001", { method: "DELETE", headers: authHeaders }), { params: Promise.resolve({ id: "DEP-001" }) });
  assert.equal(deleted.status, 200);
  assert.equal(await DepositModel.countDocuments(), 0);
  assert.equal(await ExpenseModel.countDocuments(), 0);
  const savedTransaction = await currentTransaction(transaction._id);
  assert.equal(savedTransaction?.status, "REVERSED");
  assert.equal(savedTransaction?.history?.at(-1)?.reason, "Deposit deleted");
  assert.equal(savedTransaction?.history?.at(-1)?.snapshot?.amount, 30);
});

test("registration hashes passwords, creates a persistent HttpOnly session, and login rejects wrong passwords", async () => {
  const register = await registerRequest(new Request("https://local.test/api/auth/register", {
    method: "POST", headers: { origin: "https://local.test", host: "local.test", "x-forwarded-proto": "https", "content-type": "application/json" },
    body: JSON.stringify({ name: "New User", email: "New.User@example.test", password: "StrongPass123", confirmPassword: "StrongPass123" })
  }));
  assert.equal(register.status, 201);
  const headers = register.headers.get("set-cookie") ?? "";
  assert.match(headers, /finance_session=.*HttpOnly/);
  assert.match(headers, /Max-Age=2592000|Expires=/);
  assert.match(headers, /finance_csrf=/);
  const saved = await UserModel.findOne({ email: "new.user@example.test" }).select("+passwordHash");
  assert.ok(saved?.passwordHash.startsWith("scrypt$"));
  assert.notEqual(saved?.passwordHash, "StrongPass123");

  const badLogin = await loginRequest(new Request("https://local.test/api/auth/login", {
    method: "POST", headers: { origin: "https://local.test", host: "local.test", "x-forwarded-proto": "https", "content-type": "application/json" },
    body: JSON.stringify({ email: "new.user@example.test", password: "wrong" })
  }));
  assert.equal(badLogin.status, 401);
  const goodLogin = await loginRequest(new Request("https://local.test/api/auth/login", {
    method: "POST", headers: { origin: "https://local.test", host: "local.test", "x-forwarded-proto": "https", "content-type": "application/json" },
    body: JSON.stringify({ email: "new.user@example.test", password: "StrongPass123" })
  }));
  assert.equal(goodLogin.status, 200);
});

test("PIN unlock only unlocks a still-valid session and locks after five incorrect attempts", async () => {
  assert.equal((await pinUnlockRequest(new Request("https://local.test/api/auth/pin/unlock", {
    method: "POST", headers: { origin: "https://local.test", host: "local.test", "x-forwarded-proto": "https", "content-type": "application/json" }, body: JSON.stringify({ pin: "2468" })
  }))).status, 401);
  const setup = await pinSetupRequest(new Request("https://local.test/api/auth/pin", {
    method: "PUT", headers: { ...authHeaders, "content-type": "application/json" }, body: JSON.stringify({ pin: "2468", password: "CorrectHorse12" })
  }));
  assert.equal(setup.status, 200);
  const saved = await UserModel.findById(ownerId).select("+pinHash");
  assert.ok(saved?.pinHash?.startsWith("scrypt$"));
  assert.notEqual(saved?.pinHash, "2468");
  const session = await UserSessionModel.findOne({ userId: ownerId });
  await UserSessionModel.updateOne({ _id: session?._id }, { $set: { pinUnlockedUntil: new Date(Date.now() - 1000) } });
  assert.equal((await listDepositRequest(new Request("https://local.test/api/deposits", { headers: authHeaders }))).status, 423);
  const unlock = () => pinUnlockRequest(new Request("https://local.test/api/auth/pin/unlock", {
    method: "POST", headers: { ...authHeaders, "content-type": "application/json" }, body: JSON.stringify({ pin: "2468" })
  }));
  const unlocked = await unlock();
  assert.equal(unlocked.status, 200);
  assert.ok((await UserSessionModel.findById(session?._id))?.pinUnlockedUntil.getTime() > Date.now());

  await UserSessionModel.updateOne({ _id: session?._id }, { $set: { pinUnlockedUntil: new Date(Date.now() - 1000) } });
  for (let i = 0; i < 4; i += 1) assert.equal((await pinUnlockRequest(new Request("https://local.test/api/auth/pin/unlock", {
    method: "POST", headers: { ...authHeaders, "content-type": "application/json" }, body: JSON.stringify({ pin: "9999" })
  }))).status, 401);
  assert.equal((await pinUnlockRequest(new Request("https://local.test/api/auth/pin/unlock", {
    method: "POST", headers: { ...authHeaders, "content-type": "application/json" }, body: JSON.stringify({ pin: "9999" })
  }))).status, 423);
});

test("session expiry and missing CSRF token deny finance API access", async () => {
  const session = await UserSessionModel.findOne({ userId: ownerId });
  await UserSessionModel.updateOne({ _id: session?._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  const expired = await listDepositRequest(new Request("https://local.test/api/deposits", { headers: authHeaders }));
  assert.equal(expired.status, 401);
  await UserSessionModel.updateOne({ _id: session?._id }, { $set: { expiresAt: new Date(Date.now() + 86_400_000) } });
  const missingCsrf = await manualDepositRequest(new Request("https://local.test/api/deposits", {
    method: "POST", headers: { cookie: authHeaders.cookie, origin: "https://local.test", host: "local.test", "x-forwarded-proto": "https", "content-type": "application/json" }, body: JSON.stringify({ amount: 1, source: "Test" })
  }));
  assert.equal(missingCsrf.status, 403);
});

test("logout revokes the server-side session and clears both cookies", async () => {
  const response = await logoutRequest(new Request("https://local.test/api/auth/logout", { method: "POST", headers: authHeaders }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/);
  assert.equal((await listDepositRequest(new Request("https://local.test/api/deposits", { headers: authHeaders }))).status, 401);
});

test("password change requires the current password and invalidates other sessions", async () => {
  const secondToken = createOpaqueToken();
  await UserSessionModel.create({ userId: ownerId, tokenHash: digestToken(secondToken), expiresAt: new Date(Date.now() + 86_400_000), pinUnlockedUntil: new Date(Date.now() + 86_400_000) });
  const response = await changePasswordRequest(new Request("https://local.test/api/auth/password", {
    method: "PUT", headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({ currentPassword: "CorrectHorse12", password: "NewSecurePassword34", confirmPassword: "NewSecurePassword34" })
  }));
  assert.equal(response.status, 200);
  assert.equal(await UserSessionModel.countDocuments({ userId: ownerId, revokedAt: null }), 1);
  const oldPassword = await loginRequest(new Request("https://local.test/api/auth/login", {
    method: "POST", headers: { origin: "https://local.test", host: "local.test", "x-forwarded-proto": "https", "content-type": "application/json" },
    body: JSON.stringify({ email: (await UserModel.findById(ownerId))?.email, password: "CorrectHorse12" })
  }));
  assert.equal(oldPassword.status, 401);
});

test("finance reads and relationships are isolated to the authenticated user", async () => {
  await deposit(100);
  const other = await UserModel.create({ name: "Other", email: `other-${crypto.randomUUID()}@test.local`, passwordHash: await hashSecret("CorrectHorse12") });
  const foreignDeposit = await DepositModel.create({ userId: other._id, depositId: "DEP-OTHER", amount: 500, source: "Other", savingsAmount: 0, spendableAmount: 500, remainingAmount: 500 });
  await ExpenseModel.create({ userId: other._id, amount: 25, category: "Food", depositId: foreignDeposit.depositId, depositReference: foreignDeposit._id });
  const depositsResponse = await listDepositRequest(new Request("https://local.test/api/deposits", { headers: authHeaders }));
  const deposits = await depositsResponse.json();
  assert.equal(deposits.length, 1);
  assert.equal(deposits[0].depositId, "DEP-001");
  const foreignExpense = await manualExpenseRequest(new Request("https://local.test/api/expenses", {
    method: "POST", headers: { ...authHeaders, "content-type": "application/json" }, body: JSON.stringify({ amount: 10, depositId: "DEP-OTHER", category: "Other" })
  }));
  assert.equal(foreignExpense.status, 404);
  assert.equal(await ExpenseModel.countDocuments({ userId: ownerId }), 0);
  const expenseResponse = await listExpenseRequest(new Request("https://local.test/api/expenses", { headers: authHeaders }));
  assert.equal(expenseResponse.status, 200);
  assert.equal((await expenseResponse.json()).length, 0);
});

test("a user cannot revoke another user's device and SMS ownership comes from its token", async () => {
  const other = await UserModel.create({ name: "Other", email: `device-${crypto.randomUUID()}@test.local`, passwordHash: await hashSecret("CorrectHorse12") });
  const otherDevice = await DeviceModel.create({ userId: other._id, name: "Other phone", tokenHash: hashDeviceToken(createDeviceToken()), status: "ACTIVE" });
  const denied = await revokeDeviceRequest(new Request(`https://local.test/api/devices/${otherDevice._id}`, { method: "DELETE", headers: authHeaders }), { params: Promise.resolve({ id: String(otherDevice._id) }) });
  assert.equal(denied.status, 404);
  assert.equal((await DeviceModel.findById(otherDevice._id))?.revokedAt, null);

  const rawToken = createDeviceToken();
  await DeviceModel.create({ userId: ownerId, name: "Owned phone", tokenHash: hashDeviceToken(rawToken), status: "ACTIVE" });
  const spoofed = await smsRequest(new Request("https://local.test/api/sms", {
    method: "POST", headers: { authorization: `Bearer ${rawToken}`, "x-device-timestamp": String(Date.now()), "content-type": "application/json" },
    body: JSON.stringify({ amount: 4, transactionType: "DEBIT", timestamp: new Date().toISOString(), userId: String(other._id) })
  }));
  assert.equal(spoofed.status, 400);
  const upload = await smsRequest(new Request("https://local.test/api/sms", {
    method: "POST", headers: { authorization: `Bearer ${rawToken}`, "x-device-timestamp": String(Date.now()), "content-type": "application/json" },
    body: JSON.stringify({ amount: 4, transactionType: "DEBIT", timestamp: new Date().toISOString() })
  }));
  assert.equal(upload.status, 201);
  const imported = await BankTransactionModel.findOne({});
  assert.equal(String(imported?.userId), String(ownerId));
});

test("pairing challenge expires after five minutes and cannot be claimed", async () => {
  const { response, body } = await startPairing();
  assert.equal(response.status, 201);
  assert.equal(body.code.length, 10);
  const stored = await DevicePairingChallengeModel.findOne({ userId: ownerId }).select("+codeHash");
  assert.ok(stored);
  assert.notEqual(stored.codeHash, body.code);
  await DevicePairingChallengeModel.updateOne({ _id: stored._id }, { $set: { expiresAt: new Date(Date.now() - 1) } });
  const claim = claimPairing(body.code);
  assert.equal((await claim.request()).status, 410);
  assert.equal(await DeviceModel.countDocuments(), 0);
});

test("pairing code is single use and a lost-response retry with the same token is idempotent", async () => {
  const { body } = await startPairing();
  const claim = claimPairing(body.code);
  const first = await claim.request();
  const retry = await claim.request();
  assert.equal(first.status, 201);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).duplicate, true);
  assert.equal(await DeviceModel.countDocuments({ userId: ownerId }), 1);
  const second = claimPairing(body.code);
  assert.equal((await second.request()).status, 409);
  assert.equal(await DeviceModel.countDocuments({ userId: ownerId }), 1);
});

test("Android claim rejects client-supplied user ownership", async () => {
  const { body } = await startPairing();
  const claim = claimPairing(body.code);
  const response = await claimDeviceRequest(new Request("https://local.test/api/device-pairings/claim", {
    method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.51" },
    body: JSON.stringify({ code: body.code, deviceName: "Samsung", deviceToken: claim.deviceToken, userId: "000000000000000000000000" })
  }));
  assert.equal(response.status, 400);
  assert.equal(await DeviceModel.countDocuments(), 0);
});

test("concurrent claims of one challenge create exactly one device", async () => {
  const { body } = await startPairing();
  const first = claimPairing(body.code);
  const second = claimPairing(body.code);
  const responses = await Promise.all([first.request(), second.request()]);
  assert.equal(responses.filter(response => response.status === 201).length, 1);
  assert.equal(responses.filter(response => response.status === 409).length, 1);
  assert.equal(await DeviceModel.countDocuments({ userId: ownerId }), 1);
});

test("device claim is pending until the owner approves and foreign owners cannot manage it", async () => {
  const { body } = await startPairing();
  const claim = claimPairing(body.code);
  const claimed = await claim.request();
  assert.equal(claimed.status, 201);
  const device = await DeviceModel.findOne({ userId: ownerId });
  assert.equal(device?.status, "PENDING");

  const other = await UserModel.create({ name: "Other", email: `pair-${crypto.randomUUID()}@test.local`, passwordHash: await hashSecret("CorrectHorse12") });
  const foreignToken = createOpaqueToken();
  await UserSessionModel.create({ userId: other._id, tokenHash: digestToken(foreignToken), expiresAt: new Date(Date.now() + 86_400_000), pinUnlockedUntil: new Date(Date.now() + 86_400_000) });
  const foreignHeaders = { cookie: `finance_session=${foreignToken}; finance_csrf=foreign-csrf`, "x-csrf-token": "foreign-csrf", origin: "https://local.test", host: "local.test", "x-forwarded-proto": "https", "content-type": "application/json" };
  const forbidden = await updateDeviceRequest(new Request(`https://local.test/api/devices/${device?._id}`, { method: "PATCH", headers: foreignHeaders, body: JSON.stringify({ action: "approve" }) }), { params: Promise.resolve({ id: String(device?._id) }) });
  assert.equal(forbidden.status, 404);

  const deniedBeforeApproval = await smsRequest(new Request("https://local.test/api/sms", {
    method: "POST", headers: { authorization: `Bearer ${claim.deviceToken}`, "x-device-timestamp": String(Date.now()), "content-type": "application/json" },
    body: JSON.stringify({ amount: 8, transactionType: "DEBIT", timestamp: new Date().toISOString() })
  }));
  assert.equal(deniedBeforeApproval.status, 401);

  const approved = await updateDeviceRequest(new Request(`https://local.test/api/devices/${device?._id}`, { method: "PATCH", headers: { ...authHeaders, "content-type": "application/json" }, body: JSON.stringify({ action: "approve" }) }), { params: Promise.resolve({ id: String(device?._id) }) });
  assert.equal(approved.status, 200);
  assert.equal((await DeviceModel.findById(device?._id))?.status, "ACTIVE");
  const status = await deviceStatusRequest(new Request("https://local.test/api/device/status", { headers: { authorization: `Bearer ${claim.deviceToken}`, "x-device-timestamp": String(Date.now()) } }));
  assert.deepEqual(await status.json(), { status: "ACTIVE" });
});

test("denied and revoked devices cannot ingest; device can self-disconnect and observe revocation", async () => {
  const { body } = await startPairing();
  const claim = claimPairing(body.code);
  await claim.request();
  const device = await DeviceModel.findOne({ userId: ownerId });
  const denied = await updateDeviceRequest(new Request(`https://local.test/api/devices/${device?._id}`, { method: "PATCH", headers: { ...authHeaders, "content-type": "application/json" }, body: JSON.stringify({ action: "deny" }) }), { params: Promise.resolve({ id: String(device?._id) }) });
  assert.equal(denied.status, 200);
  assert.equal((await deviceStatusRequest(new Request("https://local.test/api/device/status", { headers: { authorization: `Bearer ${claim.deviceToken}`, "x-device-timestamp": String(Date.now()) } }))).status, 200);
  const state = await deviceStatusRequest(new Request("https://local.test/api/device/status", { headers: { authorization: `Bearer ${claim.deviceToken}`, "x-device-timestamp": String(Date.now()) } }));
  assert.deepEqual(await state.json(), { status: "REVOKED" });
  const upload = await smsRequest(new Request("https://local.test/api/sms", {
    method: "POST", headers: { authorization: `Bearer ${claim.deviceToken}`, "x-device-timestamp": String(Date.now()), "content-type": "application/json" },
    body: JSON.stringify({ amount: 8, transactionType: "DEBIT", timestamp: new Date().toISOString() })
  }));
  assert.equal(upload.status, 401);
  assert.equal(await BankTransactionModel.countDocuments(), 0);
});

test("device self-disconnect revokes an active credential", async () => {
  const token = createDeviceToken();
  const device = await DeviceModel.create({ userId: ownerId, name: "Self disconnect", tokenHash: hashDeviceToken(token), status: "ACTIVE" });
  const headers = { authorization: `Bearer ${token}`, "x-device-timestamp": String(Date.now()) };
  const disconnected = await deviceDisconnectRequest(new Request("https://local.test/api/device/disconnect", { method: "POST", headers }));
  assert.deepEqual(await disconnected.json(), { status: "REVOKED" });
  assert.equal((await DeviceModel.findById(device._id))?.status, "REVOKED");
  assert.equal((await deviceStatusRequest(new Request("https://local.test/api/device/status", { headers }))).status, 200);
});

test("dashboard owner revocation blocks the device token while another user cannot revoke it", async () => {
  const token = createDeviceToken();
  const device = await DeviceModel.create({ userId: ownerId, name: "Owner phone", tokenHash: hashDeviceToken(token), status: "ACTIVE" });
  const other = await UserModel.create({ name: "Other", email: `revoke-${crypto.randomUUID()}@test.local`, passwordHash: await hashSecret("CorrectHorse12") });
  const otherToken = createOpaqueToken();
  await UserSessionModel.create({ userId: other._id, tokenHash: digestToken(otherToken), expiresAt: new Date(Date.now() + 86_400_000), pinUnlockedUntil: new Date(Date.now() + 86_400_000) });
  const foreignHeaders = { cookie: `finance_session=${otherToken}; finance_csrf=foreign-csrf`, "x-csrf-token": "foreign-csrf", origin: "https://local.test", host: "local.test", "x-forwarded-proto": "https" };
  assert.equal((await revokeDeviceRequest(new Request(`https://local.test/api/devices/${device._id}`, { method: "DELETE", headers: foreignHeaders }), { params: Promise.resolve({ id: String(device._id) }) })).status, 404);
  assert.equal((await revokeDeviceRequest(new Request(`https://local.test/api/devices/${device._id}`, { method: "DELETE", headers: authHeaders }), { params: Promise.resolve({ id: String(device._id) }) })).status, 200);

  const deviceHeaders = { authorization: `Bearer ${token}`, "x-device-timestamp": String(Date.now()) };
  const status = await deviceStatusRequest(new Request("https://local.test/api/device/status", { headers: deviceHeaders }));
  assert.deepEqual(await status.json(), { status: "REVOKED" });
  const disconnect = await deviceDisconnectRequest(new Request("https://local.test/api/device/disconnect", { method: "POST", headers: deviceHeaders }));
  assert.deepEqual(await disconnect.json(), { status: "REVOKED" });
});

test("login throttling blocks after the limit and expires using a controllable clock", async () => {
  const initial = new Date();
  for (let i = 0; i < 10; i += 1) assert.equal(await takeAuthAttempt("login", "clock-test", initial), true);
  assert.equal(await takeAuthAttempt("login", "clock-test", initial), false);
  assert.equal(await takeAuthAttempt("login", "clock-test", new Date(initial.getTime() + 16 * 60_000)), true);
});
