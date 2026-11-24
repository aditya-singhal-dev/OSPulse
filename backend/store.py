import csv
import io
import json
import sqlite3
import time
from contextlib import closing
from pathlib import Path


class Store:
    def __init__(self, path):
        self.path = Path(path)

    def connect(self):
        db = sqlite3.connect(self.path)
        db.row_factory = sqlite3.Row
        return db

    def initialize(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(self.connect()) as db, db:
            db.executescript("""
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS metrics (time REAL PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY, time REAL, event TEXT, result TEXT);
            CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT);
            CREATE TABLE IF NOT EXISTS alerts (
              id INTEGER PRIMARY KEY, time REAL, key TEXT, level TEXT, message TEXT,
              action TEXT, pid INTEGER, read INTEGER DEFAULT 0);
            CREATE INDEX IF NOT EXISTS alert_key_time ON alerts(key, time);
            """)

    def settings(self, settings=None):
        with closing(self.connect()) as db, db:
            if settings is not None:
                db.execute("INSERT OR REPLACE INTO settings VALUES (1, ?)", (settings.model_dump_json(),))
                return settings
            row = db.execute("SELECT data FROM settings WHERE id=1").fetchone()
            return row["data"] if row else None

    def log(self, event, result):
        with closing(self.connect()) as db, db:
            db.execute("INSERT INTO logs(time,event,result) VALUES(?,?,?)", (time.time(), event, result))

    def persist(self, samples, alerts, timestamp):
        with closing(self.connect()) as db, db:
            db.executemany("INSERT OR REPLACE INTO metrics VALUES (?,?)",
                           ((p["time"], json.dumps(p)) for p in samples))
            for alert in alerts:
                inserted = db.execute("""
                    INSERT INTO alerts(time,key,level,message,action,pid)
                    SELECT :time,:key,:level,:message,:action,:pid
                    WHERE NOT EXISTS (SELECT 1 FROM alerts WHERE key=:key AND time>:cutoff)
                    """, {**alert, "time": timestamp, "cutoff": timestamp - 300})
                if inserted.rowcount:
                    db.execute("INSERT INTO logs(time,event,result) VALUES(?,?,?)",
                               (timestamp, "Resource observation", alert["message"]))
            for table in ("metrics", "alerts", "logs"):
                db.execute(f"DELETE FROM {table} WHERE time < ?", (timestamp - 7 * 86400,))

    def read_alert(self, alert_id):
        with closing(self.connect()) as db, db:
            return bool(db.execute("UPDATE alerts SET read=1 WHERE id=?", (alert_id,)).rowcount)

    def rows(self, table, limit):
        with closing(self.connect()) as db:
            data = db.execute(f"SELECT * FROM {table} ORDER BY time DESC LIMIT ?", (limit,)).fetchall()
            return [json.loads(row["data"]) if table == "metrics" else dict(row) for row in data]

    def export(self, table):
        rows = self.rows(table, 604800)
        fields = {
            "metrics": ["time", "cpu", "memory", "swap", "disk", "load", "read", "write", "processes", "health", "available", "cores"],
            "logs": ["id", "time", "event", "result"],
            "alerts": ["id", "time", "key", "level", "message", "action", "pid", "read"],
        }[table]
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: "'" + v if isinstance(v, str) and v.lstrip().startswith(("=", "+", "-", "@")) else json.dumps(v) if isinstance(v, list) else v
                             for k, v in row.items()})
        return output.getvalue()
