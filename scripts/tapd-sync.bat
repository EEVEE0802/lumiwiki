@echo off
cd /d D:\lumiwiki
node scripts/tapd-sync.mjs >> D:\lumiwiki\tapd-sync.log 2>&1
