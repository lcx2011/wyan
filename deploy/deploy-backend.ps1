param(
  [string]$HostAlias = 'home',
  [string]$RemoteDir = '/opt/wenyan'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$archive = Join-Path ([System.IO.Path]::GetTempPath()) ("wenyan-{0}.tar.gz" -f [guid]::NewGuid().ToString('N'))
$remoteScript = $null
$remoteArchive = '/tmp/wenyan-deploy.tar.gz'

try {
  # tar is included with current Windows versions and keeps the Linux upload simple.
  tar -czf $archive `
    --exclude='./node_modules' `
    --exclude='./dist' `
    --exclude='./coverage' `
    --exclude='./data/*.sqlite' `
    --exclude='./data/*.sqlite-shm' `
    --exclude='./data/*.sqlite-wal' `
    -C $projectRoot .

  scp $archive ("{0}:{1}" -f $HostAlias, $remoteArchive)
  $remote = @"
set -eu
sudo mkdir -p '$RemoteDir' /var/lib/wenyan
sudo chown -R `$(id -un):`$(id -gn) '$RemoteDir' /var/lib/wenyan
tar -xzf '$remoteArchive' -C '$RemoteDir'
cd '$RemoteDir'
npm ci
npm run build
sudo install -m 0644 deploy/wenyan.service /etc/systemd/system/wenyan.service
sudo sed -i "s/REPLACE_WITH_SERVER_USER/`$(id -un)/" /etc/systemd/system/wenyan.service
sudo systemctl daemon-reload
sudo systemctl enable wenyan
# 必须用 restart：enable --now 在服务已运行时不会重启它，会导致新代码不生效
sudo systemctl restart wenyan
curl --fail http://127.0.0.1:8878/api/health
"@
  # 关键：here-string 经 PowerShell 管道喂给 ssh 时首行会带 BOM、换行变 CRLF，
  # 导致远程 `set -eu` 失效、curl 健康检查 URL 被 \r 污染（curl: (3)）。
  # 改为写出 UTF-8（无 BOM、LF）脚本文件上传后执行，避免编码污染。
  $tempDirectory = [System.IO.Path]::GetTempPath()
  $remoteName = "wenyan-remote-{0}.sh" -f ([guid]::NewGuid().ToString('N'))
  $remoteScript = [System.IO.Path]::Combine($tempDirectory, $remoteName)
  [System.IO.File]::WriteAllText($remoteScript, $remote.Replace("`r`n", "`n"), (New-Object System.Text.UTF8Encoding($false)))
  scp $remoteScript ("{0}:/tmp/wenyan-remote.sh" -f $HostAlias)
  ssh $HostAlias 'bash /tmp/wenyan-remote.sh'
  ssh $HostAlias 'rm -f /tmp/wenyan-remote.sh'
  Write-Host "Backend deployed to ${HostAlias}:$RemoteDir"
}
finally {
  Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
  if ($null -ne $remoteScript) { Remove-Item -LiteralPath $remoteScript -Force -ErrorAction SilentlyContinue }
}
