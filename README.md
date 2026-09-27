# Hastreiter Dienstleistungen – App

Interne Verwaltungs-App für Hastreiter Dienstleistungen.

## Bereiche
- Dashboard
- Anfragen
- Einnahmen
- Ausgaben
- Belege
- Aufträge
- Reinigung
- Kalender
- Auswertungen

## Supabase
Vor dem ersten Start `config.js` öffnen und den **anon/public key** aus Supabase > Settings > API eintragen.

**Nie den `service_role`-Key in die App eintragen.**

## Auth
Der vorgesehene interne Login ist:
`hastreiter-dienstleistungen@gmx.de`

Der Benutzer muss in Supabase unter Authentication > Users angelegt werden. Das Passwort wird nicht im Quellcode gespeichert.

## Nächste Ausbaustufen
1. Öffentliche Kundenseite für Anfragen
2. Anfrage-zu-Auftrag übernehmen
3. Kalenderlogik für einmalig/jährlich/regelmäßig
4. Belegfoto + OCR
5. Dateiablage für Belege
6. Einnahmen-/Ausgaben-Erfassung
7. PWA/Installierbarkeit
8. Google-Indexierung der öffentlichen Anfrageseite
