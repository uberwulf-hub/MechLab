<#
.SYNOPSIS
    Makes Mech Garage's permanent Android signing key on this PC, once, and shows the three GitHub secrets to add.
.DESCRIPTION
    The key is saved as "SauceStore Keys\mechgarage-android.keystore" in your user folder, with a random password.
    Back up that file AND the password (a password manager is ideal). Then add the three values this prints as
    repository secrets in MechLab: Settings > Secrets and variables > Actions > New repository secret.
    Every release is signed with it on GitHub. Never put the key or its password in the repo, an email or a chat.
.EXAMPLE
    ./tools/New-AndroidKey.ps1
#>
$ErrorActionPreference = 'Stop'
$dir = Join-Path $HOME 'SauceStore Keys'
$keystore = Join-Path $dir 'mechgarage-android.keystore'
if (Test-Path $keystore) { throw "A key already exists at $keystore. Keep using it (Android needs the same key forever)." }
New-Item -ItemType Directory -Force -Path $dir | Out-Null

# keytool comes with Java: SauceStore's Install-AndroidTools.ps1 puts one in %LOCALAPPDATA%\Android\jdk-21.
$keytool = @((Join-Path $env:LOCALAPPDATA 'Android\jdk-21\bin\keytool.exe'), 'keytool') |
    Where-Object { $_ -eq 'keytool' -and (Get-Command keytool -ErrorAction SilentlyContinue) -or (Test-Path $_) } | Select-Object -First 1
if (-not $keytool) { throw 'keytool not found. Run SauceStore''s tools/Install-AndroidTools.ps1 first (it installs Java).' }

$bytes = New-Object byte[] 18
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$password = [Convert]::ToBase64String($bytes).Replace('+', 'x').Replace('/', 'y')
$alias = 'mechgarage'
& $keytool -genkeypair -keystore $keystore -alias $alias -keyalg RSA -keysize 2048 -validity 10000 `
    -storepass $password -keypass $password -dname 'CN=Mech Garage' | Out-Null
if ($LASTEXITCODE) { throw 'keytool failed.' }

$base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($keystore))
Set-Clipboard -Value $base64
Write-Host ''
Write-Host "Made $keystore" -ForegroundColor Green
Write-Host 'Back up this file, and save the password below in your password manager.' -ForegroundColor Yellow
Write-Host ''
Write-Host 'Add these in MechLab: Settings > Secrets and variables > Actions > New repository secret'
Write-Host '  ANDROID_KEYSTORE_BASE64    (already copied to your clipboard: just paste it)'
Write-Host "  ANDROID_KEYSTORE_ALIAS     $alias"
Write-Host "  ANDROID_KEYSTORE_PASSWORD  $password"
Write-Host ''
