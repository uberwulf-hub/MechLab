<#
.SYNOPSIS
    Starts a Mech Garage release on GitHub (Actions > Release). GitHub builds the Windows and Android apps, signs the
    Android app with MechLab's own key and publishes both, and SauceStore lists the new version. Your PC does no
    building or signing. The same setup as SauceStore's tools/Release-Client.ps1.
.DESCRIPTION
    Before running: bump <Version> in src/MechGarage.Version.props, write what changed in release-notes/v<version>.md
    (one change per line, starting "Added …"/"New: …", "Fixed …" or "Known issue: …"), commit and push. You can also
    start it from your phone: github.com > MechLab > Actions > Release > Run workflow.
.EXAMPLE
    ./tools/Release-Game.ps1
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$version = 'v' + (([xml](Get-Content (Join-Path $root 'src/MechGarage.Version.props'))).Project.PropertyGroup.Version | Where-Object { $_ } | Select-Object -First 1)
if (-not (Test-Path (Join-Path $root "release-notes/$version.md"))) { throw "Write release-notes/$version.md first." }
if (git -C $root status --porcelain) { throw 'Commit and push your changes first.' }
git -C $root fetch --quiet origin
if ((git -C $root rev-parse HEAD) -ne (git -C $root rev-parse '@{u}')) { throw 'Push your commits first.' }
gh workflow run release.yml --repo uberwulf-hub/MechLab -f "version=$version"
if ($LASTEXITCODE) { throw 'Could not start the release workflow (is gh signed in?).' }
Write-Host "Started the $version release. Watch it at https://github.com/uberwulf-hub/MechLab/actions" -ForegroundColor Green
