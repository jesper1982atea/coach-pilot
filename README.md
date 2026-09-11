# Coach Pilot

Oberoende pilot för Apple Sales Coach i Microsoft Edge på Mac. Inte en officiell Apple- eller Atea-produkt.

## Installera eller uppdatera

Hämta ZIP-paketet från [senaste releasen](https://github.com/jesper1982atea/coach-pilot/releases/latest), packa upp och öppna **Coach Pilot Setup.app**. Följ START HÄR.html. Kräver Apple Silicon, macOS 26+ och Edge. AI-funktioner behöver Apple Intelligence. Paketet är lokalt signerat men inte Developer ID-signerat eller notariserat.

Vid uppdatering: stoppa autopiloten, kör nya installationsappen, välj **Läs in igen** på `edge://extensions` och ladda om Sales Coach. Äldre versioner än 0.5.0 behöver uppdateras manuellt en gång.

## Uppdateringskontroll

Från 0.5.0 kontrollerar panelen GitHubs offentliga release-API när den öppnas, högst var tolfte timme. **Sök uppdatering** gör en ny kontroll direkt. Inga GitHub-token behövs och inga kursfrågor, svar eller Sales Coach-uppgifter skickas. GitHub ser vanlig anslutningsinformation, exempelvis IP-adress. Endast stabila releaser med förväntat installationspaket accepteras. Ingen fjärrkod laddas eller körs av kontrollen. Installation och omladdning sker manuellt.

## Utveckling

```sh
npm ci
npm test
npm run build
bash scripts/build-native.sh
python3 scripts/package-release.py
```

Paketbyggaren kräver macOS med Swift-kompilator. Versionsnumret finns i scripts/build.mjs. Utdata hamnar i build/. Publicera ZIP och SHA256SUMS.txt som tillgångar på en GitHub Release med taggen `v<VERSION>`. Releasen måste vara publicerad, inte draft eller prerelease, för att erbjudas i panelen.

## Omfattning

Tre svenska Academy-tester för Mac, iPad och iPhone verifierades med 100 % den 11 september 2026. Exakt innehållsmatchning krävs för de lokala svarstabellerna. Övriga frågor använder experimentellt AI-stöd och kan behöva manuell granskning. Det är ingen garanti för alla material eller framtida testversioner.

Källkod publiceras för insyn. Ingen separat öppen källkodslicens har valts.
