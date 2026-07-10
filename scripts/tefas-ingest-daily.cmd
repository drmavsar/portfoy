@echo off
REM ============================================================
REM  TEFAS NAV gunluk otomatik ingest (Windows Gorev Zamanlayici)
REM ------------------------------------------------------------
REM  Bu dosya kendi konumundan proje ko7kune cikip (..) tum aktif
REM  fonlarin NAV'ini ceker. Cikti tefas-ingest.log dosyasina yazilir.
REM
REM  Tek seferlik kurulum (PowerShell, yonetici sart degil):
REM    $a = New-ScheduledTaskAction -Execute "C:\Projeler\portfoy\scripts\tefas-ingest-daily.cmd"
REM    $t = New-ScheduledTaskTrigger -Daily -At 9:00am
REM    $s = New-ScheduledTaskSettingsSet -StartWhenAvailable
REM    Register-ScheduledTask -TaskName "TEFAS NAV Ingest" -Action $a -Trigger $t -Settings $s
REM ============================================================

cd /d "%~dp0.."

echo [%date% %time%] TEFAS NAV ingest basladi >> tefas-ingest.log
call npm run tefas:prices:ingest >> tefas-ingest.log 2>&1
echo [%date% %time%] Bitti (cikis kodu %errorlevel%) >> tefas-ingest.log
echo. >> tefas-ingest.log
