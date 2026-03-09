import { getTimestamp } from "./utils.js";

export function normalizeRegistrationCodeRecord(record, now = getTimestamp()) {
  if (!record) {
    return {
      exists: false,
      usable: false,
      reason: "not_found"
    };
  }

  if (record.status !== "active") {
    return {
      exists: true,
      usable: false,
      reason: "disabled"
    };
  }

  if (record.expires_at && Number(record.expires_at) < now) {
    return {
      exists: true,
      usable: false,
      reason: "expired"
    };
  }

  if (
    record.max_uses !== null &&
    record.max_uses !== undefined &&
    Number(record.max_uses) >= 0 &&
    Number(record.used_count) >= Number(record.max_uses)
  ) {
    return {
      exists: true,
      usable: false,
      reason: "max_uses_exceeded"
    };
  }

  return {
    exists: true,
    usable: true,
    reason: "ok"
  };
}

export class Database {
  constructor(binding) {
    if (!binding) {
      throw new Error("D1 binding 'database' is required");
    }

    this.binding = binding;
  }

  async countDevices() {
    const row = await this.binding
      .prepare("SELECT COUNT(*) AS row_count FROM devices WHERE status = 'active'")
      .first();

    return row?.row_count ?? 0;
  }

  async getDeviceByKey(deviceKey) {
    return this.binding
      .prepare(
        "SELECT id, device_key, device_token, status, created_at, updated_at, last_registered_at FROM devices WHERE device_key = ?"
      )
      .bind(deviceKey)
      .first();
  }

  async getDeviceTokenByKey(deviceKey) {
    const row = await this.binding
      .prepare("SELECT device_token, status FROM devices WHERE device_key = ?")
      .bind(deviceKey)
      .first();

    if (!row || row.status !== "active") {
      return undefined;
    }

    return row.device_token;
  }

  async saveDevice({ deviceKey, deviceToken, status = "active", now = getTimestamp() }) {
    return this.binding
      .prepare(
        `INSERT INTO devices (device_key, device_token, status, created_at, updated_at, last_registered_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(device_key) DO UPDATE SET
           device_token = excluded.device_token,
           status = excluded.status,
           updated_at = excluded.updated_at,
           last_registered_at = excluded.last_registered_at`
      )
      .bind(deviceKey, deviceToken, status, now, now, now)
      .run();
  }

  async markDeviceInactive(deviceKey, now = getTimestamp()) {
    return this.binding
      .prepare(
        "UPDATE devices SET status = 'inactive', updated_at = ? WHERE device_key = ?"
      )
      .bind(now, deviceKey)
      .run();
  }

  async getRegistrationCodeByHash(codeHash) {
    return this.binding
      .prepare(
        `SELECT id, name, code_hash, status, expires_at, max_uses, used_count, created_at, updated_at
         FROM registration_codes
         WHERE code_hash = ?`
      )
      .bind(codeHash)
      .first();
  }

  async incrementRegistrationCodeUse(id, now = getTimestamp()) {
    return this.binding
      .prepare(
        "UPDATE registration_codes SET used_count = used_count + 1, updated_at = ? WHERE id = ?"
      )
      .bind(now, id)
      .run();
  }

  async registerDevice({ deviceKey, deviceToken, codeId, now = getTimestamp() }) {
    const saveStmt = this.binding
      .prepare(
        `INSERT INTO devices (device_key, device_token, status, created_at, updated_at, last_registered_at)
         VALUES (?, ?, 'active', ?, ?, ?)
         ON CONFLICT(device_key) DO UPDATE SET
           device_token = excluded.device_token,
           status = excluded.status,
           updated_at = excluded.updated_at,
           last_registered_at = excluded.last_registered_at`
      )
      .bind(deviceKey, deviceToken, now, now, now);

    const incrementStmt = this.binding
      .prepare(
        "UPDATE registration_codes SET used_count = used_count + 1, updated_at = ? WHERE id = ?"
      )
      .bind(now, codeId);

    return this.binding.batch([saveStmt, incrementStmt]);
  }

  async getAuthCache() {
    return this.binding
      .prepare("SELECT token, issued_at FROM auth_cache WHERE id = 1")
      .first();
  }

  async saveAuthCache(token, issuedAt = getTimestamp()) {
    return this.binding
      .prepare(
        `INSERT INTO auth_cache (id, token, issued_at)
         VALUES (1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET token = excluded.token, issued_at = excluded.issued_at`
      )
      .bind(token, issuedAt)
      .run();
  }
}
