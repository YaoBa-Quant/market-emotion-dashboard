import Database from 'better-sqlite3'
import { config } from './config.js'

const db = new Database(config.sqlitePath)

db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS market_emotion_snapshots (
    trade_date TEXT NOT NULL,
    algo_version TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    PRIMARY KEY (trade_date, algo_version)
  );
`)

const selectSnapshotStatement = db.prepare(`
  SELECT trade_date, algo_version, snapshot_json, created_at, updated_at
  FROM market_emotion_snapshots
  WHERE trade_date = ? AND algo_version = ?
`)

const upsertSnapshotStatement = db.prepare(`
  INSERT INTO market_emotion_snapshots (
    trade_date,
    algo_version,
    snapshot_json,
    created_at,
    updated_at
  )
  VALUES (
    ?,
    ?,
    ?,
    datetime('now', 'localtime'),
    datetime('now', 'localtime')
  )
  ON CONFLICT(trade_date, algo_version) DO UPDATE SET
    snapshot_json = excluded.snapshot_json,
    updated_at = datetime('now', 'localtime')
`)

const selectLatestTradeDateStatement = db.prepare(`
  SELECT trade_date
  FROM market_emotion_snapshots
  WHERE algo_version = ?
  ORDER BY trade_date DESC
  LIMIT 1
`)

const deleteSnapshotStatement = db.prepare(`
  DELETE FROM market_emotion_snapshots
  WHERE trade_date = ? AND algo_version = ?
`)

const listTradeDatesStatement = db.prepare(`
  SELECT trade_date
  FROM market_emotion_snapshots
  WHERE algo_version = ?
  ORDER BY trade_date DESC
  LIMIT ?
`)

const listSnapshotsBetweenStatement = db.prepare(`
  SELECT trade_date, algo_version, snapshot_json, created_at, updated_at
  FROM market_emotion_snapshots
  WHERE algo_version = ?
    AND trade_date >= ?
    AND trade_date <= ?
  ORDER BY trade_date ASC
`)

export function getStoredSnapshot(tradeDate, algoVersion = config.algoVersion) {
  const row = selectSnapshotStatement.get(tradeDate, algoVersion)
  if (!row) return null

  return {
    tradeDate: row.trade_date,
    algoVersion: row.algo_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    snapshot: JSON.parse(row.snapshot_json),
  }
}

export function saveSnapshot(tradeDate, snapshot, algoVersion = config.algoVersion) {
  upsertSnapshotStatement.run(tradeDate, algoVersion, JSON.stringify(snapshot))
}

export function getLatestStoredTradeDate(algoVersion = config.algoVersion) {
  return selectLatestTradeDateStatement.get(algoVersion)?.trade_date || null
}

export function deleteStoredSnapshot(tradeDate, algoVersion = config.algoVersion) {
  return deleteSnapshotStatement.run(tradeDate, algoVersion).changes
}

export function listStoredTradeDates(algoVersion = config.algoVersion, limit = 3650) {
  return listTradeDatesStatement.all(algoVersion, limit).map((item) => item.trade_date)
}

export function listStoredSnapshotsBetween(startDate, endDate, algoVersion = config.algoVersion) {
  return listSnapshotsBetweenStatement.all(algoVersion, startDate, endDate).map((row) => ({
    tradeDate: row.trade_date,
    algoVersion: row.algo_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    snapshot: JSON.parse(row.snapshot_json),
  }))
}
