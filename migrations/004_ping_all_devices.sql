INSERT INTO checks(device_id, name, kind, interval_seconds, timeout_ms, config)
SELECT d.id, 'Ping availability', 'ping', 60, 5000, '{}'::jsonb
FROM devices d
WHERE NOT EXISTS (SELECT 1 FROM checks c WHERE c.device_id=d.id AND c.kind='ping')
ON CONFLICT DO NOTHING;
