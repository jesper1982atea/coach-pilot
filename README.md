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

## Academy först (från 0.5.4)

Piloten försöker Academy först och söker nya upplåsningar efter framsteg. När Academy inte kan slutföras fortsätter den med övrigt under För dig. Ett bestående besked visar återstående låsningar och krav utan att markera Academy som klar. Nästa automatiska sökning försöker Academy på nytt. Personliga uppgifter efterfrågas i panelen och skickas in manuellt i Sales Coach.

## Börja direkt (från 0.5.6)

Piloten bygger inte längre en fullständig inventering innan arbetet börjar. När ett ogjort moment hittas bearbetas det och slutförandet kontrolleras innan sökningen fortsätter. Academy försöks först. Även video körs direkt när momentet hittas; ett misslyckat eller personligt moment lämnas för uppföljning och provas inte om i samma körning. Antalet hittade moment växer under körningen och är inte hela webbplatsens total.

## Stabilare körning (från 0.5.7)

Tillfälligt utbytta Sales Coach-ramar återansluts automatiskt och avbryter inte längre hela sökningen. Efter läsning eller inskickat test kontrolleras samlingen flera gånger eftersom registreringen kan dröja. Om Edge kräver ett användarklick för video visas **Behöver ett klick** med en knapp som öppnar rätt video; tryck Play och starta sedan autopiloten igen.

## Kompletta specialistmärken (från 0.5.8)

Långa workshopkurser på `/home/course/...` räknas nu som krav och visas i kön. Eventkurser som kräver en särskild inbjudan markeras **Åtkomst saknas** med Sales Coach-orsaken. Interaktiva läsavsnitt får längre lästid mellan öppningarna så att Sales Coach hinner registrera dem.

## Testomförsök (från 0.5.9)

Piloten känner igen Sales Coach-resultat som **33 % – Gå igenom dina svar och försök igen**. Ett underkänt test granskas mot kursmaterialet och kan försökas igen högst fyra gånger. Samma underkända svarskombination skickas aldrig in två gånger. Implementeringsresan för Mac (`475822`) har en innehållsmatchad svarstabell som verifierades med 100 % den 11 september 2026.

## Bekräftad kursgenomgång (från 0.6.0)

På interaktiva kurssidor öppnar piloten alla avsnitt och går igenom relevanta flikar, kort och **Visa mer**-kontroller. Navigations-, meny-, nedladdnings- och mediakontroller ingår inte i den generella klickningen. Piloten känner igen **100 %**, tydliga slutförandebesked och **intjänade erfarenhetspoäng** som direkta bevis på att Sales Coach har godkänt momentet. Samlingens registrerade status kontrolleras fortfarande innan momentet markeras som klart i kön.

## Rulla hela kursen (från 0.6.1)

Piloten rullar stegvis genom både sidan och inre rullbara kursytor. Nya och nästlade avsnitt som visas efter ett klick bearbetas rekursivt. Flera interna **Nästa/Fortsätt**-kontroller kan följas en i taget genom kursens undersidor. Efter bottenläget och undersidorna väntar piloten på XP eller success och kontrollerar sedan samlingens registrering. Utan någon av dessa bekräftelser visas momentet som **Ej verifierad**, aldrig som klart.
