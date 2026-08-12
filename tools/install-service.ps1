$ErrorActionPreference = 'Continue'
$log = "D:\lumiwiki\tools\install-log.txt"
"[$(Get-Date)] === 开始 ===" | Out-File $log

$nssm = "D:\lumiwiki\tools\nssm.exe"
$service = "LumiWiki"
$python = "C:\Python314\python.exe"
$workdir = "D:\lumiwiki\dist"

# 检查已有服务
$existing = & sc.exe query $service 2>&1
if ($LASTEXITCODE -eq 0) {
    "[$(Get-Date)] 移除旧服务" | Add-Content $log
    & $nssm stop $service 2>&1 | Add-Content $log
    & $nssm remove $service confirm 2>&1 | Add-Content $log
    Start-Sleep -Seconds 2
}

"[$(Get-Date)] 注册服务" | Add-Content $log
& $nssm install $service $python "-m" "http.server" "3005" 2>&1 | Add-Content $log
& $nssm set $service AppDirectory $workdir 2>&1 | Add-Content $log
& $nssm set $service DisplayName "LumiWiki Static Server" 2>&1 | Add-Content $log
& $nssm set $service Description "LumiWiki wiki server on port 3005" 2>&1 | Add-Content $log
& $nssm set $service Start SERVICE_AUTO_START 2>&1 | Add-Content $log
& $nssm set $service AppExit Default Restart 2>&1 | Add-Content $log
& $nssm set $service AppRestartDelay 3000 2>&1 | Add-Content $log
& $nssm set $service AppStdout "D:\lumiwiki\tools\lumiwiki-service.out.log" 2>&1 | Add-Content $log
& $nssm set $service AppStderr "D:\lumiwiki\tools\lumiwiki-service.err.log" 2>&1 | Add-Content $log

"[$(Get-Date)] 启动服务" | Add-Content $log
& $nssm start $service 2>&1 | Add-Content $log

"[$(Get-Date)] 完成，服务状态：" | Add-Content $log
& sc.exe query $service 2>&1 | Add-Content $log
