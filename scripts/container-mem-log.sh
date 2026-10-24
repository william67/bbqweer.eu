#!/bin/sh
# One line per minute in /var/log/container-mem.log: host memory (MB) and the memory of every container.
# Installed on the VPS by /etc/cron.d/container-mem, rotated by /etc/logrotate.d/container-mem (see docs/weather-charts.md).
ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
host=$(free -m | awk '/^Mem:/{print "used=" $3 " avail=" $7}')
ctr=$(docker stats --no-stream --format '{{.Name}}={{.MemUsage}}' 2>/dev/null | sed 's# /.*##; s#^bbqweer-##' | sort | tr '\n' ' ')
echo "$ts $host | $ctr" >> /var/log/container-mem.log
