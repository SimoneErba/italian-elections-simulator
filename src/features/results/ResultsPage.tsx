import { Fragment, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { formatBigInt, formatPercent, percentage } from "../../electoral-engine/arithmetic/fraction";
import type { Chamber } from "../../electoral-engine/domain/chamber";
import type { Candidate, ElectoralLawVersionId, ElectionInput, ElectionSimulationResult } from "../../electoral-engine/domain/election";
import { loadLegacyCameraCsv } from "../../datasets/loaders/legacy-csv-loader";
import { loadScenarioJson } from "../../datasets/loaders/json-loader";
import { aggregateVotes } from "../../electoral-engine/pipeline/aggregate-votes";
import { getLawVersion } from "../../electoral-engine/rules/registry";
import { useAppStore } from "../../app/store";
import cameraCandidateListUrl from "../../../data/input/camera-2022-candidatilista.csv?url";
import cameraScrutiniUrl from "../../../data/input/Politiche2022_Scrutini_Camera_Italia.csv?url";
import senateCandidateListUrl from "../../../data/input/senato-2022-candlista.csv?url";
import senateScrutiniUrl from "../../../data/input/Politiche2022_Scrutini_Senato_Italia.csv?url";
import bonusCandidateListsUrl from "../../../data/input/bonus-candidates-2022-random.csv?url";
import foreignElectionUrl from "../../../data/input/estero.json?url";
import specialTerritoriesUrl from "../../../data/input/special-territories-2022.json?url";

type Language = "it" | "en";
type SimulationMode = "2026" | "rosatellum" | "comparison";
type ReportSection = "national" | "arcs" | "bonus" | "members" | "constituencies" | "debug";

const defaultReportSectionOpen: Record<ReportSection, boolean> = {
  national: true,
  arcs: true,
  bonus: true,
  members: false,
  constituencies: false,
  debug: false
};

const lawVersionsForMode: Record<SimulationMode, ElectoralLawVersionId[]> = {
  "2026": ["ac-2822-a-2026-07-16"],
  rosatellum: ["rosatellum-2022"],
  comparison: ["rosatellum-2022", "ac-2822-a-2026-07-16"]
};

const sampleDataFiles = [
  { url: cameraScrutiniUrl, name: "Politiche2022_Scrutini_Camera_Italia.csv" },
  { url: senateScrutiniUrl, name: "Politiche2022_Scrutini_Senato_Italia.csv" },
  { url: cameraCandidateListUrl, name: "camera-2022-candidatilista.csv" },
  { url: senateCandidateListUrl, name: "senato-2022-candlista.csv" },
  { url: bonusCandidateListsUrl, name: "bonus-candidates-2022-random.csv" },
  { url: foreignElectionUrl, name: "estero.json" },
  { url: specialTerritoriesUrl, name: "special-territories-2022.json" }
] as const;

const formspreeFormIdByReportKind: Record<ReportKind, string> = {
  feedback: "xjybpeyv",
  bug: "xyegbdej"
};

type ReportKind = "bug" | "feedback";

const translations = {
  it: {
    languageName: "Italiano",
    switchLanguage: "Passa all'inglese",
    themeLight: "Passa al tema chiaro",
    themeDark: "Passa al tema scuro",
    loadingDemo: "Caricamento dataset demo...",
    demoLoadFailed: "Caricamento demo non riuscito.",
    readingFiles: "Lettura file in corso...",
    normalizingData: "Importazione e normalizzazione dati...",
    unrecognizedFolder: "Importazione cartella non riconosciuta: servono i file scrutini Camera e Senato OnData 2022.",
    missingForeignElection: "Importazione incompleta: estero.json e' obbligatorio per una simulazione legislativa completa.",
    calculating: "Calcolo simulazione...",
    importFailed: "Importazione non riuscita.",
    downloadingSample: "Preparazione download dati 2022...",
    sampleDownloadFailed: "Download dei dati 2022 non riuscito.",
    title: "Simulatore elettorale italiano",
    lead: "Simula l'assegnazione dei seggi parlamentari con la proposta 2026, il Rosatellum o un confronto tra i due sistemi.",
    loadDemo: "Simula con i dati 2022",
    backToMainMenu: "Torna al menu principale",
    demoLoadedRandomBonus: "Dati 2022 caricati. La lista premio usa candidati fittizi, perche' non esisteva nel 2022.",
    downloadSample: "Scarica ZIP dati 2022",
    importJsonCsv: "Personalizza i dati",
    workflowTitle: "Crea una simulazione",
    workflowLead: "Usa direttamente i risultati delle elezioni 2022 oppure modifica voti e candidati.",
    stepOneTitle: "Scegli la modalita",
    stepOneBody: "La modalita stabilisce le regole della simulazione. Confronta le leggi mostra gli effetti dei due sistemi affiancati.",
    stepTwoTitle: "2. Prepara i dati",
    stepTwoBody: "Scarica il set di esempio, estrailo e modifica le copie locali. I dati 2022 sono un punto di partenza: il simulatore non modifica mai i tuoi file.",
    stepThreeTitle: "3. Carica e calcola",
    stepThreeBody: "Seleziona tutti i file necessari nello stesso momento. Il simulatore riconosce automaticamente il ruolo di ogni file e mostra i risultati dopo il controllo dei dati.",
    requiredFiles: "Quali file devo caricare?",
    voteFiles: "Voti e geografia — obbligatori",
    voteFilesBody: "Politiche2022_Scrutini_Camera_Italia.csv, Politiche2022_Scrutini_Senato_Italia.csv e special-territories-2022.json. Per cambiare il consenso di una lista, modifica VOTI LISTE. Non rinominare o alterare LISTA, CIRCOSCRIZIONE, COLLEGIO PLURINOMINALE e COLLEGIO UNINOMINALE.",
    foreignFile: "Circoscrizione Estero — obbligatoria",
    foreignFileBody: "estero.json. Contiene le liste, i candidati e le preferenze per i seggi eletti all'estero.",
    candidateFiles: "Nomi degli eletti — consigliati",
    candidateFilesBody: "camera-2022-candidatilista.csv e senato-2022-candlista.csv. Modifica nomi e ordine di lista qui; descrlista deve corrispondere alla LISTA nei file dei voti e CollPlurinom al collegio plurinominale.",
    bonusFile: "Premio di maggioranza 2026 — solo legge 2026",
    bonusFileBody: "bonus-candidates-2022-random.csv. Cambia position e i nomi; conserva connectedSubjectId e chamber. Non caricarlo per Rosatellum, dove non serve.",
    downloadAndEdit: "Scarica i file da modificare",
    importAllFiles: "Carica i file e simula",
    demoAlternative: "I risultati 2022 sono pronti: avvia subito la simulazione oppure personalizza i file.",
    simulationMode: "Modalita di simulazione",
    law2026: "Proposta 2026",
    lawRosatellum: "Rosatellum",
    lawComparison: "Confronta le leggi",
    help: "Aiuto",
    reportBug: "Segnala un bug",
    giveFeedback: "Invia feedback",
    viewOnGitHub: "Vedi su GitHub",
    bugReportTitle: "Segnala un bug",
    feedbackReportTitle: "Invia feedback",
    reportSubject: "Oggetto",
    reportDescription: "Descrizione",
    reportEmail: "La tua email (facoltativa)",
    reportCancel: "Annulla",
    reportSend: "Invia segnalazione",
    reportPreparing: "Invio della segnalazione...",
    reportSendFailed: "Non è stato possibile inviare la segnalazione. Riprova tra poco.",
    reportSent: "Grazie, la segnalazione è stata inviata.",
    reportClose: "Chiudi",
    methodology: "Come funziona il calcolo: metodo, ipotesi e fonti",
    methodologyTitle: "Dal voto al seggio, passo per passo",
    methodologyIntro: "Qui puoi controllare che cosa entra nel calcolo, quale regola viene applicata e dove finisce ogni seggio. La catena verificabile è: versione della legge → file di input → regole implementate → riparti → proclamazione.",
    methodologyStatusTitle: "Che cosa stai guardando",
    methodologyStatusBody: "La modalità Proposta 2026 applicata ai voti del 2022 risponde a una domanda controfattuale: «come sarebbero stati ripartiti quei voti se fossero valse queste regole?». Non ricostruisce il risultato ufficiale del 2022 e non prevede il voto futuro. La modalità Rosatellum applica invece il sistema usato nel 2022; il confronto esegue entrambi i motori sugli stessi file.",
    methodologyInputsTitle: "1. Quali dati entrano nel motore",
    methodologyInputsIntro: "I file hanno funzioni diverse e il motore non mescola quantità che la legge tratta separatamente.",
    methodologyInputItems: [
      { label: "Voti di lista", body: "I due CSV degli scrutini comunali forniscono VOTI LISTE, lista, collegio e circoscrizione. Servono per soglie, premio e riparti proporzionali." },
      { label: "Geografia e capienza", body: "I collegi del 2022 identificano i territori; per la proposta 2026 la loro capienza viene sostituita con le tabelle versionate 314/384 Camera e 154/189 Senato, secondo che il premio scatti o no." },
      { label: "Candidati", body: "I CSV candidati danno l'ordine delle liste plurinominali. Il file bonus separato dà l'ordine dei candidati al premio. I nomi non cambiano il numero di seggi assegnato a una forza politica." },
      { label: "Bacini separati", body: "Estero e territori speciali hanno file e regole proprie. I voti diretti ai candidati speciali non sono voti di lista e non vengono sommati al proporzionale." }
    ],
    methodologyPoolsTitle: "2. Prima regola: i bacini dei seggi",
    methodologyPoolsIntro: "I seggi del premio non si aggiungono al totale: vengono sottratti al bacino proporzionale ordinario. I tre bacini — Italia ordinaria, territori speciali ed Estero — restano distinti.",
    methodologyPoolHeaders: ["Ramo", "Totale", "Estero", "Speciali", "Ordinari senza premio", "Proporzionali con premio", "Premio"],
    methodologyPoolRows: [
      ["Camera dei deputati", "400", "8", "8", "384", "314", "70"],
      ["Senato della Repubblica", "200", "4", "7", "189", "154", "35"]
    ],
    methodologyPoolFormula: "Controllo del totale: 384 + 8 + 8 = 400 alla Camera; 189 + 7 + 4 = 200 al Senato. Se c'è il premio: 314 + 70 = 384 e 154 + 35 = 189.",
    methodologyAlgorithmTitle: "3. Algoritmo della proposta 2026",
    methodologyAlgorithmIntro: "Il calcolo viene eseguito separatamente per Camera e Senato, salvo la verifica congiunta richiesta per il premio.",
    methodologyHareExampleTitle: "Esempio minimo del metodo Hare",
    methodologyHareExampleBody: "Con 1.000.000 di voti ammessi e 10 seggi, il quoziente è 100.000. Un soggetto con 260.000 voti riceve subito 2 seggi interi e conserva un resto di 60.000. Dopo aver assegnato tutti i seggi interi, gli eventuali seggi ancora liberi vanno ai resti più alti.",
    methodologyAlgorithmSteps: [
      { title: "Validazione e normalizzazione", body: "Il motore controlla duplicati, riferimenti tra liste, coalizioni e territori, coerenza della Camera, date, voti negativi e struttura di Estero. Le righe comunali vengono poi sommate con aritmetica intera, senza arrotondare i voti.", reference: "Controlli sull'input" },
      { title: "Costruzione di due totali di voto", body: "Il totale ordinario esclude Estero e territori speciali ed è usato per soglie e seggi proporzionali. Un secondo totale, usato solo per verificare il premio, include anche i voti di lista dei territori speciali. I voti personali dei candidati speciali non entrano in nessuno dei due totali di lista; Estero resta sempre fuori.", reference: "Separazione dei bacini" },
      { title: "Soglie di accesso", body: "Sono ammesse le coalizioni con almeno il 10% e almeno una lista ammessa, e le liste con almeno il 3%. Al Senato vale anche l'eccezione del 20% in una regione; sono applicate le tutele previste per le minoranze linguistiche. Nel totale di coalizione contano le liste con almeno l'1%, oltre alle liste di minoranza tutelata; in ogni coalizione ammessa viene recuperata la lista più votata tra quelle altrimenti escluse.", reference: "Art. 83 e art. 16-bis" },
      { title: "Verifica del premio", body: "Il premio scatta soltanto se lo stesso soggetto ammesso è primo sia alla Camera sia al Senato e raggiunge almeno il 42% in entrambi i rami. Se manca una sola condizione, tutti i 384/189 seggi ordinari restano proporzionali. Se scatta, 70/35 seggi sono riservati al vincitore e il proporzionale scende a 314/154. Il motore applica inoltre i tetti di 220 deputati e 113 senatori, contando gli eventuali seggi speciali del vincitore ma non Estero.", reference: "Premio con verifica congiunta" },
      { title: "Riparto proporzionale alla Camera", body: "I 384 seggi ordinari, oppure 314 con premio, sono prima distribuiti a livello nazionale tra coalizioni ammesse e liste singole. Formula Hare: quoziente = voti ammessi ÷ seggi; a ogni soggetto spettano prima i quozienti interi e poi i seggi residui in ordine di resto maggiore. I totali nazionali sono quindi restituiti alle circoscrizioni e ai collegi, con compensazioni per conservarli.", reference: "Art. 83 e art. 83-bis" },
      { title: "Riparto proporzionale al Senato", body: "I 189 seggi ordinari, oppure 154 con premio, sono distribuiti regione per regione con quoziente Hare e resti maggiori, poi ai collegi plurinominali. Il dato nazionale del Senato è la somma dei riparti regionali, non un riparto nazionale autonomo.", reference: "Art. 16-bis e art. 17" },
      { title: "Territori speciali ed Estero", body: "Per la proposta 2026 gli ordinari collegi uninominali Rosatellum ancora presenti nei CSV non assegnano alcun seggio. Sono elaborati solo i collegi marcati come Valle d'Aosta o Trentino-Alto Adige/Südtirol: negli uninominali vince il candidato con più voti; i seggi proporzionali locali della Camera in Trentino-Alto Adige usano una soglia locale del 20%. Estero viene calcolato a parte in ciascuna delle quattro ripartizioni e i candidati sono ordinati per preferenze.", reference: "Regole speciali; legge 459/2001 per Estero" },
      { title: "Distribuzione territoriale del premio", body: "I 70 seggi Camera sono distribuiti tra circoscrizioni e i 35 seggi Senato tra regioni in proporzione alla popolazione legale, con quoziente naturale e resti maggiori. Valle d'Aosta e Trentino-Alto Adige sono escluse da questo riparto. Il registro attuale usa la popolazione legale 2021; la data dell'elezione seleziona il dataset e, se manca, viene usata la data della versione di legge, 16 luglio 2026.", reference: "Popolazione legale 2021" },
      { title: "Proclamazione dei candidati", body: "Dopo aver fissato quanti seggi spettano a ogni lista e collegio, il motore percorre le candidature nell'ordine fornito. Prima tratta le liste prioritarie del premio e i vincitori diretti, poi le liste plurinominali; gestisce le pluricandidature e cerca i sostituti previsti. Se i nomi non bastano, il seggio resta assegnato alla forza politica ma non ha ancora un nominativo.", reference: "Art. 18-bis, 19, 84, 85 e 86" },
      { title: "Traccia e casi non automatici", body: "Ogni fase scrive nel Debug log regola, totali intermedi e risultato. Se una parità cade sul confine di assegnazione, oppure i dati non bastano per una proclamazione, il motore non inventa uno spareggio: lascia i seggi coinvolti irrisolti e li elenca tra le decisioni non automatiche.", reference: "Debug log e parità irrisolte" }
    ],
    methodologyAssumptionsTitle: "4. Assunzioni e limiti dichiarati",
    methodologyAssumptions: [
      "La baseline ac-2822-a-2026-07-16 è il testo A.C. 2822-A approvato dalla Camera il 16 luglio 2026 e trasmesso al Senato: è una proposta, non legge vigente.",
      "Le coalizioni del demo sono ricostruite dai collegamenti tra liste e candidato uninominale presenti nei file 2022. Se modifichi i file, devi mantenere coerenti questi collegamenti.",
      "La popolazione 2021 è usata come dato prospettico per distribuire il premio della proposta 2026; non corregge il riparto ufficiale del 2022.",
      "Il file special-territories-2022.json contiene voti di candidato. La tabella dei voti può mostrarli per chiarezza, ma il motore non li trasforma in voti di lista proporzionali.",
      "I candidati del premio nel demo 2022 sono fittizi, perché nel 2022 quelle liste circoscrizionali non esistevano. Servono solo a mostrare il meccanismo di proclamazione.",
      "Parità esatte, candidature insufficienti e cascate di subentro non determinabili dai file restano esplicitamente irrisolte. Per questo il simulatore non dichiara una conformità ufficiale completa."
    ],
    methodologyReadingTitle: "5. Come leggere e riprodurre un risultato",
    methodologyReadingBody: "Il numero di seggi assegnati a una forza politica e il numero di parlamentari con nome possono differire: il primo dipende dal riparto, il secondo anche dalla completezza delle liste candidati. Prima di citare un risultato, controlla gli avvisi e il Debug log.",
    methodologyChecklistTitle: "Annota sempre",
    methodologyChecklist: ["versione della legge selezionata", "data dell'elezione e data di esecuzione", "nomi e versione dei file caricati", "parità, seggi senza nominativo e altre decisioni non automatiche"],
    methodologySourcesTitle: "6. Fonti e documentazione verificabile",
    methodologySourcesIntro: "Le fonti normative e i dati grezzi sono distinti dalle note che documentano la loro traduzione in codice.",
    methodologySources: [
      { label: "Camera — scheda A.C. 2822", body: "Iter, testi ed emendamenti del progetto di legge.", href: "https://www.camera.it/leg19/126?idDocumento=2822&leg=19" },
      { label: "Senato — scheda A.S. 1971", body: "Testo trasmesso e fase parlamentare successiva al voto della Camera.", href: "https://www.senato.it/leggi-e-documenti/disegni-di-legge/scheda-ddl?did=59951" },
      { label: "Dossier dei Servizi studi", body: "Schede di lettura del 13 aprile 2026: utile per il contesto, ma precedente al testo approvato il 16 luglio.", href: "https://documenti.camera.it/leg19/dossier/testi/AC0469_vol1.htm" },
      { label: "Ministero dell'Interno — Politiche 2022", body: "Scrutini comunali e liste candidati del dataset demo, licenza CC BY 4.0.", href: "https://www.dati.gov.it/node/view-dataset/dataset?id=caca3eec-122a-4668-a75b-3a2426ce3ae6" },
      { label: "Gazzetta Ufficiale — popolazione legale 2021", body: "D.P.R. 20 gennaio 2023 e tabelle usate per il dataset demografico.", href: "https://www.gazzettaufficiale.it/eli/gu/2023/03/03/53/so/10/sg/pdf" },
      { label: "Senato — eletti 2022", body: "Riepilogo ufficiale usato per i collegi speciali del Trentino-Alto Adige/Südtirol.", href: "https://www.senato.it/leg/19/Elettorale/riepilogo.htm" },
      { label: "Valle d'Aosta — risultati 2022", body: "Portale elettorale regionale usato per i vincitori diretti mancanti dai normali file di importazione.", href: "https://www.regione.vda.it/amministrazione/Elezioni/Dati_e_risultati/elezioni/Mobile/Default_i.aspx?idele=168" },
      { label: "Nota di implementazione", body: "Mappa regole, assunzioni e limiti del motore nel repository.", href: "https://github.com/SimoneErba/italian-elections-simulator/blob/main/legal-spec/ac-2822-a.md" }
    ],
    helpTitle: "Come usare il simulatore",
    helpIntro: "Simuliamo la nuova legge partendo dai risultati elettorali: voti di lista, collegi, coalizioni, Estero e liste candidati.",
    helpClose: "Chiudi aiuto",
    helpItems: [
      {
        label: "Come partire",
        body:
          "Usa Simula con dati 2022 per vedere subito il calcolo. Usa Scarica ZIP dati 2022 per ottenere i file modificabili. Dopo averli cambiati, selezionali tutti insieme con Importa i tuoi dati."
      },
      {
        label: "Quali file servono",
        body:
          "Importa i due file scrutini Camera e Senato per calcolare i seggi nazionali. Aggiungi estero.json per includere la circoscrizione Estero. Aggiungi i due file candidati per vedere i nomi dei parlamentari proclamati. Il file bonus-candidates serve solo per la nuova legge 2026; non e necessario per Rosatellum."
      },
      {
        label: "Cambiare i voti",
        body:
          "Nei file Politiche2022_Scrutini_* modifica VOTI LISTE per cambiare i voti di una lista. Mantieni LISTA, CIRCOSCRIZIONE, COLLEGIO PLURINOMINALE e COLLEGIO UNINOMINALE coerenti: servono per ripartire i seggi e ricostruire le coalizioni."
      },
      {
        label: "Cambiare i candidati",
        body:
          "Nei file camera-2022-candidatilista e senato-2022-candlista modifica l'ordine delle righe, i nomi o le liste. CollPlurinom collega il candidato al collegio; descrlista deve corrispondere al nome lista negli scrutini."
      },
      {
        label: "Cambiare il premio",
        body:
          "Nel file bonus-candidates-2022-random cambia position per l'ordine di priorita, oppure lastName/firstName per i nomi. connectedSubjectId deve restare l'id della coalizione o lista che puo vincere il premio; chamber deve essere camera o senate."
      }
    ],
    law: "Legge",
    noScenario: "Nessuno scenario",
    bonus: "Premio",
    bonusDetails: "Dettaglio premio",
    bonusStatus: "Stato premio",
    bonusYes: "si",
    bonusNo: "no",
    bonusWinner: "Coalizione/lista",
    bonusPeople: "Candidati proclamati con premio",
    bonusNoPeople: "Nessun candidato proclamato tramite premio.",
    bonusFailureReasons: "Condizioni non soddisfatte",
    bonusSeatLimitReached: "Limite massimo dei seggi raggiunto",
    bonusSeatLimitDetail: "Il vincitore del premio ha raggiunto il limite previsto dalla legge: {limits}.",
    awardedTo: "attribuito a",
    notAwarded: "non attribuito",
    simulationResults: "Risultati simulazione",
    parliamentArcs: "Archi parlamentari",
    seats: "seggi",
    nationalResults: "Risultati nazionali",
    subjects: "soggetti",
    proclaimedMembers: "Parlamentari proclamati",
    constituencyReport: "Eletti per circoscrizione",
    constituency: "Circoscrizione",
    elected: "Eletti",
    notElected: "Non eletti",
    reason: "Motivo",
    noRows: "Nessuna riga disponibile.",
    notReachedReason: "non raggiunto dall'ordine di lista per i seggi assegnati",
    electedElsewhere: "proclamato in un altro collegio/circoscrizione",
    foreignPreferencesMissing: "preferenze non disponibili nel file estero",
    names: "nomi",
    debugLog: "Debug log",
    steps: "step",
    step: "Step",
    chamber: "Camera",
    seatsColumn: "Seggi",
    showParties: "Mostra partiti",
    hideParties: "Nascondi partiti",
    detail: "Dettaglio",
    validVotes: "voti validi",
    listCoalition: "Lista/coalizione",
    votes: "Voti",
    parliamentArc: "Arco",
    legend: "Legenda",
    noSeatsForChart: "Nessun seggio assegnato disponibile per il grafico.",
    age: "Eta",
    party: "Partito",
    electedIn: "Eletto in",
    warning: "Avviso",
    missingSeatsNote: "seggi non hanno ancora un nominativo: importa o completa il CSV con ordine candidati per lista e collegio.",
    downloadCsv: "Scarica CSV",
    noCandidates: "Nessun candidato proclamato. Servono liste candidati ordinate per partito e collegio.",
    name: "Nome",
    position: "Posizione",
    type: "Tipo",
    of: "di",
    first: "Prima",
    previous: "Precedente",
    page: "Pagina",
    next: "Successiva",
    last: "Ultima",
    seatsWithoutName: "Seggi senza nominativo",
    seatsWithoutNameBody:
      "seggi risultano assegnati ma non proclamabili per mancanza di candidati ordinati nel collegio, oppure per candidati insufficienti dopo pluricandidature/subentri.",
    unresolvedCandidates: "Candidati non determinati",
    all: "Tutte",
    thresholds: "Soglie",
    notCalculated: "non calcolate",
    singleLists: "liste singole",
    coalitions: "coalizioni",
    excluded: "escluse",
    nationalAllocation: "Riparto nazionale",
    noResult: "nessun risultato",
    territorialAllocation: "Riparto territoriale",
    territories: "territori",
    proclamation: "Proclamazione",
    proclaimed: "proclamati",
    withoutName: "senza nominativo",
    ties: "Parita/subentri",
    nonAutomaticDecisions: "decisioni non automatiche",
    seatNotProclaimed: "Seggio non proclamato",
    assignedSeat: "seggio assegnato",
    electedCandidatesFile: "parlamentari-proclamati.csv",
    cameraName: "Camera",
    senateName: "Senato",
    foreignName: "Estero"
  },
  en: {
    languageName: "English",
    switchLanguage: "Switch to Italian",
    themeLight: "Switch to light theme",
    themeDark: "Switch to dark theme",
    loadingDemo: "Loading demo dataset...",
    demoLoadFailed: "Demo load failed.",
    readingFiles: "Reading files...",
    normalizingData: "Importing and normalizing data...",
    unrecognizedFolder: "Folder import not recognized: the 2022 OnData Chamber and Senate results files are required.",
    missingForeignElection: "Incomplete import: estero.json is mandatory for a complete legislative simulation.",
    calculating: "Calculating simulation...",
    importFailed: "Import failed.",
    downloadingSample: "Preparing 2022 data download...",
    sampleDownloadFailed: "2022 data download failed.",
    title: "Italian election simulator",
    lead: "Simulate parliamentary-seat allocation under the 2026 proposal, Rosatellum, or compare both systems.",
    loadDemo: "Simulate with 2022 data",
    backToMainMenu: "Back to main menu",
    demoLoadedRandomBonus: "2022 data loaded. The bonus list uses fictional candidates because it did not exist in 2022.",
    downloadSample: "Download 2022 ZIP",
    importJsonCsv: "Import your data",
    workflowTitle: "Build a simulation",
    workflowLead: "Use the 2022 election results directly, or edit votes and candidates.",
    stepOneTitle: "Choose the mode",
    stepOneBody: "The mode determines the simulation rules. Compare laws shows the effects of the two systems side by side.",
    stepTwoTitle: "2. Prepare the data",
    stepTwoBody: "Download the example set, extract it, and edit your local copies. The 2022 data is a starting point: the simulator never changes your files.",
    stepThreeTitle: "3. Upload and calculate",
    stepThreeBody: "Select every required file at once. The simulator identifies each file automatically and shows results after validating the data.",
    requiredFiles: "Which files do I need to upload?",
    voteFiles: "Votes and geography — required",
    voteFilesBody: "Politiche2022_Scrutini_Camera_Italia.csv, Politiche2022_Scrutini_Senato_Italia.csv, and special-territories-2022.json. To change support for a list, edit VOTI LISTE. Do not rename or alter LISTA, CIRCOSCRIZIONE, COLLEGIO PLURINOMINALE, or COLLEGIO UNINOMINALE.",
    foreignFile: "Foreign constituency — required",
    foreignFileBody: "estero.json. It contains the lists, candidates, and preferences used to elect the foreign seats.",
    candidateFiles: "Names of elected members — recommended",
    candidateFilesBody: "camera-2022-candidatilista.csv and senato-2022-candlista.csv. Edit names and list order here; descrlista must match LISTA in the vote files, and CollPlurinom the multi-member district.",
    bonusFile: "2026 majority bonus — 2026 law only",
    bonusFileBody: "bonus-candidates-2022-random.csv. Change position and names, but retain connectedSubjectId and chamber. Do not upload it for Rosatellum, where it is not used.",
    downloadAndEdit: "Download files to edit",
    importAllFiles: "Upload files and simulate",
    demoAlternative: "The 2022 results are ready: run the simulation now, or customize the files.",
    simulationMode: "Simulation mode",
    law2026: "2026 proposal",
    lawRosatellum: "Rosatellum",
    lawComparison: "Compare laws",
    help: "Help",
    reportBug: "Report a bug",
    giveFeedback: "Send feedback",
    viewOnGitHub: "View on GitHub",
    bugReportTitle: "Report a bug",
    feedbackReportTitle: "Send feedback",
    reportSubject: "Subject",
    reportDescription: "Description",
    reportEmail: "Your email (optional)",
    reportCancel: "Cancel",
    reportSend: "Send report",
    reportPreparing: "Sending report...",
    reportSendFailed: "Unable to send the report. Please try again shortly.",
    reportSent: "Thanks, your report has been sent.",
    reportClose: "Close",
    methodology: "How the calculation works: method, assumptions, and sources",
    methodologyTitle: "From votes to seats, step by step",
    methodologyIntro: "This guide shows what enters the calculation, which rule is applied, and where every seat goes. The reviewable chain is: law version → input files → implemented rules → allocations → candidate proclamation.",
    methodologyStatusTitle: "What this result means",
    methodologyStatusBody: "Running the 2026 Proposal mode on the 2022 vote asks a counterfactual question: “how would those votes have been allocated under these rules?”. It neither reconstructs the official 2022 result nor forecasts a future vote. Rosatellum mode applies the system used in 2022; comparison mode runs both engines on the same files.",
    methodologyInputsTitle: "1. Data entering the engine",
    methodologyInputsIntro: "Each file has a distinct role, and the engine keeps quantities separate when the law does.",
    methodologyInputItems: [
      { label: "List votes", body: "The two municipal-results CSV files provide VOTI LISTE, list, district, and constituency. They feed thresholds, the bonus check, and proportional allocations." },
      { label: "Geography and capacity", body: "The 2022 districts identify territories; for the 2026 proposal, their capacities are replaced by the versioned 314/384 Chamber and 154/189 Senate tables, depending on whether the bonus is awarded." },
      { label: "Candidates", body: "Candidate CSV files provide the order of multi-member lists. A separate bonus file provides the order of bonus candidates. Names do not alter the number of seats assigned to a political subject." },
      { label: "Separate pools", body: "Foreign and special territories have their own files and rules. Direct candidate tallies in special territories are not list votes and are never added to the proportional vote." }
    ],
    methodologyPoolsTitle: "2. First rule: the seat pools",
    methodologyPoolsIntro: "Bonus seats are not added to Parliament: they are removed from the ordinary proportional pool. The three pools—ordinary Italy, special territories, and Foreign—remain separate.",
    methodologyPoolHeaders: ["Chamber", "Total", "Foreign", "Special", "Ordinary, no bonus", "Proportional with bonus", "Bonus"],
    methodologyPoolRows: [
      ["Chamber of Deputies", "400", "8", "8", "384", "314", "70"],
      ["Senate of the Republic", "200", "4", "7", "189", "154", "35"]
    ],
    methodologyPoolFormula: "Total check: 384 + 8 + 8 = 400 in the Chamber; 189 + 7 + 4 = 200 in the Senate. With a bonus: 314 + 70 = 384 and 154 + 35 = 189.",
    methodologyAlgorithmTitle: "3. The 2026 proposal algorithm",
    methodologyAlgorithmIntro: "The Chamber and Senate are calculated separately, except for the joint test required to award the bonus.",
    methodologyHareExampleTitle: "Minimal Hare-method example",
    methodologyHareExampleBody: "With 1,000,000 admitted votes and 10 seats, the quotient is 100,000. A subject with 260,000 votes immediately receives 2 integer seats and keeps a remainder of 60,000. After all integer seats are assigned, any seats still available go to the largest remainders.",
    methodologyAlgorithmSteps: [
      { title: "Validation and normalization", body: "The engine checks duplicate IDs, links among lists, coalitions, and territories, chamber consistency, dates, negative votes, and the Foreign structure. Municipal rows are then summed with integer arithmetic, with no rounding of votes.", reference: "Input controls" },
      { title: "Building two vote totals", body: "The ordinary total excludes Foreign and special territories and is used for thresholds and proportional seats. A second total, used only for the bonus test, also includes special-territory list votes. Personal candidate tallies from special districts enter neither list total; Foreign always remains outside.", reference: "Separation of pools" },
      { title: "Access thresholds", body: "Coalitions require at least 10% and at least one admitted list; lists require at least 3%. The Senate also has a 20% exception in one region, and protected linguistic minorities receive the implemented statutory treatment. A coalition's vote includes lists with at least 1%, plus protected-minority lists; within each admitted coalition, the strongest otherwise excluded list is recovered.", reference: "Article 83 and Article 16-bis" },
      { title: "Bonus test", body: "The bonus is awarded only when the same admitted subject ranks first in both chambers and reaches at least 42% in each. If any condition fails, all 384/189 ordinary seats remain proportional. If it passes, 70/35 seats are reserved for the winner and the proportional pools fall to 314/154. The engine also applies caps of 220 deputies and 113 senators, counting the winner's special-territory seats but not Foreign.", reference: "Joint bonus test" },
      { title: "Chamber proportional allocation", body: "The 384 ordinary seats, or 314 with a bonus, are first allocated nationally among admitted coalitions and standalone lists. Hare formula: quotient = admitted votes ÷ seats; each subject first receives its integer quotients, then remaining seats by largest remainder. National totals are then returned to constituencies and districts, with compensation to preserve them.", reference: "Article 83 and Article 83-bis" },
      { title: "Senate proportional allocation", body: "The 189 ordinary seats, or 154 with a bonus, are allocated region by region with the Hare quotient and largest remainders, then to multi-member districts. The national Senate figure is the sum of the regional allocations, not a separate national allocation.", reference: "Article 16-bis and Article 17" },
      { title: "Special territories and Foreign", body: "Under the 2026 proposal, ordinary Rosatellum single-member districts still present in the CSV files award no seat. Only districts marked Valle d'Aosta or Trentino-Alto Adige/Südtirol are processed: the highest-vote candidate wins special single-member districts; the Chamber's local proportional Trentino seats use a 20% local threshold. Foreign is calculated separately in each of four partitions and candidates are ranked by preferences.", reference: "Special rules; Law 459/2001 for Foreign" },
      { title: "Territorial distribution of the bonus", body: "The 70 Chamber seats are distributed among constituencies and the 35 Senate seats among regions in proportion to legal population, using a natural quotient and largest remainders. Valle d'Aosta and Trentino-Alto Adige are excluded. The current registry uses the 2021 legal population; the election date selects the dataset, falling back to the law-version date, 16 July 2026, when missing.", reference: "2021 legal population" },
      { title: "Candidate proclamation", body: "After seats per list and district are fixed, the engine walks nominations in the supplied order. It processes bonus priority lists and direct winners first, then multi-member lists; it handles multiple nominations and searches the implemented substitute sequence. When names run out, the seat remains assigned to the political subject but has no named member yet.", reference: "Articles 18-bis, 19, 84, 85, and 86" },
      { title: "Trace and non-automatic cases", body: "Every phase writes its rule, intermediate totals, and outcome to the Debug log. When an exact tie falls on an allocation boundary, or the input cannot determine a proclamation, the engine does not invent a tie-break: affected seats remain unresolved and are listed as non-automatic decisions.", reference: "Debug log and unresolved ties" }
    ],
    methodologyAssumptionsTitle: "4. Declared assumptions and limits",
    methodologyAssumptions: [
      "The ac-2822-a-2026-07-16 baseline is A.C. 2822-A as approved by the Chamber on 16 July 2026 and transmitted to the Senate: it is a proposal, not current law.",
      "Demo coalitions are reconstructed from links between lists and single-member candidates in the 2022 files. Edited files must preserve those links consistently.",
      "The 2021 population is used prospectively to distribute the 2026 proposal's bonus; it does not correct the official 2022 allocation.",
      "special-territories-2022.json contains candidate votes. The vote table may show them for clarity, but the engine does not convert them into proportional list votes.",
      "Bonus candidates in the 2022 demo are fictional because those constituency-level bonus lists did not exist in 2022. They only demonstrate the proclamation mechanism.",
      "Exact ties, insufficient candidacies, and substitution cascades that the input cannot determine remain explicitly unresolved. The simulator therefore does not claim complete official conformity."
    ],
    methodologyReadingTitle: "5. Reading and reproducing a result",
    methodologyReadingBody: "Seats assigned to a political subject and seats with a named member may differ: allocation determines the former, while the latter also depends on candidate-file completeness. Check warnings and the Debug log before citing a result.",
    methodologyChecklistTitle: "Always record",
    methodologyChecklist: ["selected law version", "election date and run date", "names and versions of every input file", "ties, unnamed seats, and other non-automatic decisions"],
    methodologySourcesTitle: "6. Verifiable sources and documentation",
    methodologySourcesIntro: "Legislative and raw-data sources are kept distinct from the notes documenting how they were translated into code.",
    methodologySources: [
      { label: "Chamber — A.C. 2822 bill page", body: "Legislative progress, texts, and amendments.", href: "https://www.camera.it/leg19/126?idDocumento=2822&leg=19" },
      { label: "Senate — A.S. 1971 bill page", body: "Transmitted text and the parliamentary stage after the Chamber vote.", href: "https://www.senato.it/leggi-e-documenti/disegni-di-legge/scheda-ddl?did=59951" },
      { label: "Parliamentary research dossier", body: "Reading notes dated 13 April 2026: useful context, but earlier than the text approved on 16 July.", href: "https://documenti.camera.it/leg19/dossier/testi/AC0469_vol1.htm" },
      { label: "Interior Ministry — 2022 election", body: "Municipal returns and candidate lists used by the demo, under CC BY 4.0.", href: "https://www.dati.gov.it/node/view-dataset/dataset?id=caca3eec-122a-4668-a75b-3a2426ce3ae6" },
      { label: "Official Gazette — 2021 legal population", body: "Presidential Decree of 20 January 2023 and tables used for the population dataset.", href: "https://www.gazzettaufficiale.it/eli/gu/2023/03/03/53/so/10/sg/pdf" },
      { label: "Senate — members elected in 2022", body: "Official summary used for special districts in Trentino-Alto Adige/Südtirol.", href: "https://www.senato.it/leg/19/Elettorale/riepilogo.htm" },
      { label: "Valle d'Aosta — 2022 results", body: "Regional election portal used for direct winners missing from the ordinary import files.", href: "https://www.regione.vda.it/amministrazione/Elezioni/Dati_e_risultati/elezioni/Mobile/Default_i.aspx?idele=168" },
      { label: "Implementation note", body: "Mapping of rules, assumptions, and engine limits in the repository.", href: "https://github.com/SimoneErba/italian-elections-simulator/blob/main/legal-spec/ac-2822-a.md" }
    ],
    helpTitle: "How to use the simulator",
    helpIntro: "We simulate the new law from election results: list votes, districts, coalitions, foreign seats, and candidate lists.",
    helpClose: "Close help",
    helpItems: [
      {
        label: "How to start",
        body:
          "Use Simulate with 2022 data to see the calculation immediately. Use Download 2022 ZIP to get editable files. After changing them, select all files together with Import your data."
      },
      {
        label: "Which files matter",
        body:
          "Import the Chamber and Senate vote files to calculate national seats. Add estero.json to include the foreign constituency. Add the two candidate-list files to see proclaimed member names. The bonus-candidates file is only used for the new 2026 law; it is not needed for Rosatellum."
      },
      {
        label: "Changing votes",
        body:
          "In the Politiche2022_Scrutini_* files, edit VOTI LISTE to change a list's votes. Keep LISTA, CIRCOSCRIZIONE, COLLEGIO PLURINOMINALE, and COLLEGIO UNINOMINALE consistent because they drive seat allocation and coalition detection."
      },
      {
        label: "Changing candidates",
        body:
          "In camera-2022-candidatilista and senato-2022-candlista, change row order, names, or lists. CollPlurinom links the candidate to the district; descrlista must match the list name used in the vote files."
      },
      {
        label: "Changing the bonus",
        body:
          "In bonus-candidates-2022-random, edit position to change priority order, or lastName/firstName to change names. connectedSubjectId must stay the id of the coalition or list that can win the bonus; chamber must be camera or senate."
      }
    ],
    law: "Law",
    noScenario: "No scenario",
    bonus: "Bonus",
    bonusDetails: "Bonus details",
    bonusStatus: "Bonus status",
    bonusYes: "yes",
    bonusNo: "no",
    bonusWinner: "Coalition/list",
    bonusPeople: "Candidates proclaimed through bonus",
    bonusNoPeople: "No candidate was proclaimed through the bonus.",
    bonusFailureReasons: "Failed conditions",
    bonusSeatLimitReached: "Maximum seat limit reached",
    bonusSeatLimitDetail: "The bonus winner has reached the statutory seat limit: {limits}.",
    awardedTo: "awarded to",
    notAwarded: "not awarded",
    simulationResults: "Simulation results",
    parliamentArcs: "Parliament arcs",
    seats: "seats",
    nationalResults: "National results",
    subjects: "subjects",
    proclaimedMembers: "Proclaimed MPs",
    constituencyReport: "Elected by constituency",
    constituency: "Constituency",
    elected: "Elected",
    notElected: "Not elected",
    reason: "Reason",
    noRows: "No rows available.",
    notReachedReason: "not reached by the list order for the allocated seats",
    electedElsewhere: "proclaimed in another district/constituency",
    foreignPreferencesMissing: "preferences unavailable in the foreign file",
    names: "names",
    debugLog: "Debug log",
    steps: "steps",
    step: "Step",
    chamber: "Chamber",
    seatsColumn: "Seats",
    showParties: "Show parties",
    hideParties: "Hide parties",
    detail: "Detail",
    validVotes: "valid votes",
    listCoalition: "List/coalition",
    votes: "Votes",
    parliamentArc: "Arc",
    legend: "Legend",
    noSeatsForChart: "No assigned seats are available for the chart.",
    age: "Age",
    party: "Party",
    electedIn: "Elected in",
    warning: "Warning",
    missingSeatsNote: "seats do not have a name yet: import or complete the CSV with candidate order by list and constituency.",
    downloadCsv: "Download CSV",
    noCandidates: "No candidate has been proclaimed. Ordered candidate lists by party and constituency are required.",
    name: "Name",
    position: "Position",
    type: "Type",
    of: "of",
    first: "First",
    previous: "Previous",
    page: "Page",
    next: "Next",
    last: "Last",
    seatsWithoutName: "Seats without a name",
    seatsWithoutNameBody:
      "seats are assigned but cannot be proclaimed because ordered constituency candidates are missing, or because there are not enough candidates after multiple nominations/substitutions.",
    unresolvedCandidates: "Unresolved candidates",
    all: "All",
    thresholds: "Thresholds",
    notCalculated: "not calculated",
    singleLists: "single lists",
    coalitions: "coalitions",
    excluded: "excluded",
    nationalAllocation: "National allocation",
    noResult: "no result",
    territorialAllocation: "Territorial allocation",
    territories: "territories",
    proclamation: "Proclamation",
    proclaimed: "proclaimed",
    withoutName: "without a name",
    ties: "Ties/substitutions",
    nonAutomaticDecisions: "non-automatic decisions",
    seatNotProclaimed: "Seat not proclaimed",
    assignedSeat: "assigned seat",
    electedCandidatesFile: "proclaimed-mps.csv",
    cameraName: "Chamber",
    senateName: "Senate",
    foreignName: "Foreign"
  }
} as const;

type Translation = (typeof translations)[Language];

export function ResultsPage() {
  const { scenario, results, loadScenario, loadOnDataFiles, loadFixture } = useAppStore();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [loadingStatus, setLoadingStatus] = useState<string>();
  const [darkTheme, setDarkTheme] = useState(() => {
    const savedTheme = window.localStorage.getItem("italian-elections-theme");
    if (savedTheme) return savedTheme === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const [language, setLanguage] = useState<Language>(() => {
    const savedLanguage = window.localStorage.getItem("italian-elections-language");
    return savedLanguage === "en" ? "en" : "it";
  });
  const [simulationMode, setSimulationMode] = useState<SimulationMode>("2026");
  const [displayedSimulationMode, setDisplayedSimulationMode] = useState<SimulationMode>("2026");
  const [showMainMenu, setShowMainMenu] = useState(() => !results);
  const [showCustomData, setShowCustomData] = useState(false);
  const [reportKind, setReportKind] = useState<ReportKind>();
  const t = translations[language];
  const themeToggleLabel = darkTheme ? t.themeLight : t.themeDark;
  const subtitle = t.lead;
  const subjectNameById = useMemo(() => buildSubjectNameById(scenario), [scenario]);
  const candidateById = useMemo(() => buildCandidateById(scenario), [scenario]);

  useEffect(() => {
    document.documentElement.dataset.theme = darkTheme ? "dark" : "light";
    window.localStorage.setItem("italian-elections-theme", darkTheme ? "dark" : "light");
  }, [darkTheme]);

  useEffect(() => {
    document.documentElement.lang = language;
    window.localStorage.setItem("italian-elections-language", language);
  }, [language]);

  async function loadDemo() {
    setError(undefined);
    setNotice(undefined);
    setLoadingStatus(t.loadingDemo);
    try {
      await nextFrame();
      await loadFixture(lawVersionsForMode[simulationMode]);
      setDisplayedSimulationMode(simulationMode);
      setShowMainMenu(false);
      setNotice(t.demoLoadedRandomBonus);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : t.demoLoadFailed);
    } finally {
      setLoadingStatus(undefined);
    }
  }

  async function downloadSampleData() {
    setError(undefined);
    setNotice(undefined);
    setLoadingStatus(t.downloadingSample);
    try {
      const files = [];
      for (const file of sampleDataFiles.filter((file) => simulationMode !== "rosatellum" || !isBonusFile(file.name))) {
        const response = await fetch(file.url);
        if (!response.ok) throw new Error(`${t.sampleDownloadFailed} ${file.name}`);
        files.push({ name: file.name, data: new Uint8Array(await response.arrayBuffer()) });
        await nextFrame();
      }
      downloadBlob(await buildZip(files), "dati-2022.zip");
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : t.sampleDownloadFailed);
    } finally {
      setLoadingStatus(undefined);
    }
  }

  async function importFiles(files: FileList) {
    setError(undefined);
    setNotice(undefined);
    setLoadingStatus(t.readingFiles);
    try {
      const selected = [...files];
      const texts = await Promise.all(selected.map(async (file) => ({ file, text: await file.text() })));
      setLoadingStatus(t.normalizingData);
      await nextFrame();
      const onDataCamera = texts.find(({ file, text }) => isOnDataScrutini(file.name, text, "camera"));
      const onDataSenate = texts.find(({ file, text }) => isOnDataScrutini(file.name, text, "senate"));
      const bonusNominations = findBonusFile(texts, isLegacyBonusNominationFile);
      const bonusCandidateLists = findBonusFile(texts, isBonusCandidateListFile);
      const cameraCandidates = texts.find(({ file, text }) => isCandidateList(file.name, text, "camera"));
      const senateCandidates = texts.find(({ file, text }) => isCandidateList(file.name, text, "senate"));
      const foreignElection = texts.find(({ file, text }) => isForeignElectionJson(file.name, text));
      const specialTerritories = texts.find(({ file, text }) => isSpecialTerritoriesJson(file.name, text));
      const csvFiles = selected.filter((file) => file.name.toLowerCase().endsWith(".csv"));
      setLoadingStatus(t.calculating);
      await nextFrame();
      if (onDataCamera && onDataSenate) {
        if (!foreignElection) failImport(t.missingForeignElection);
        await loadOnDataFiles({
          cameraScrutiniCsv: onDataCamera.text,
          senateScrutiniCsv: onDataSenate.text,
          bonusNominationsCsv: bonusNominations?.text,
          bonusCandidateListsCsv: bonusCandidateLists?.text,
          cameraCandidateListCsv: cameraCandidates?.text,
          senateCandidateListCsv: senateCandidates?.text,
          foreignElectionJson: foreignElection.text,
          specialTerritoriesJson: specialTerritories?.text
        }, lawVersionsForMode[simulationMode]);
      } else {
        const loaded = csvFiles.length > 1
          ? failImport(t.unrecognizedFolder)
          : selected[0]?.name.toLowerCase().endsWith(".csv")
            ? loadLegacyCameraCsv(texts[0].text)
            : loadScenarioJson(texts[0].text);
        await loadScenario(loaded, lawVersionsForMode[simulationMode]);
      }
      setDisplayedSimulationMode(simulationMode);
      setShowMainMenu(false);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : t.importFailed);
    } finally {
      setLoadingStatus(undefined);
    }
  }

  return (
    <main className="appShell">
      <section className="topbar">
        <div className="topbarContent">
          <div className="topbarHeader">
            <div>
              <h1>{t.title}</h1>
              <p className="topbarLead">{subtitle}</p>
            </div>
            <div className="topbarControls">
              {results && !showMainMenu ? (
                <button
                  type="button"
                  className="secondaryButton iconButton"
                  onClick={() => setShowMainMenu(true)}
                  aria-label={t.backToMainMenu}
                  title={t.backToMainMenu}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                </button>
              ) : null}
              <button
                type="button"
                className="secondaryButton languageButton"
                onClick={() => setLanguage((current) => (current === "it" ? "en" : "it"))}
                aria-label={t.switchLanguage}
              >
                <span aria-hidden="true">{language === "it" ? "🇮🇹" : "🇬🇧"}</span>
                <span>{language === "it" ? "IT" : "EN"}</span>
              </button>
              <button type="button" className="secondaryButton themeButton" aria-pressed={darkTheme} onClick={() => setDarkTheme((enabled) => !enabled)}>
                {darkTheme ? "☀" : "☾"}
                <span className="visuallyHidden">{themeToggleLabel}</span>
              </button>
            </div>
          </div>
          <details className="methodologyGuide">
            <summary>{t.methodology}</summary>
            <div className="methodologyBody">
              <header className="methodologyHeader">
                <h2>{t.methodologyTitle}</h2>
                <p>{t.methodologyIntro}</p>
                <aside className="methodologyStatus">
                  <h3>{t.methodologyStatusTitle}</h3>
                  <p>{t.methodologyStatusBody}</p>
                </aside>
              </header>

              <section className="methodologySection" aria-labelledby="methodology-inputs-title">
                <h3 id="methodology-inputs-title">{t.methodologyInputsTitle}</h3>
                <p>{t.methodologyInputsIntro}</p>
                <dl className="methodologyInputGrid">
                  {t.methodologyInputItems.map((item) => (
                    <div key={item.label}>
                      <dt>{item.label}</dt>
                      <dd>{item.body}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section className="methodologySection" aria-labelledby="methodology-pools-title">
                <h3 id="methodology-pools-title">{t.methodologyPoolsTitle}</h3>
                <p>{t.methodologyPoolsIntro}</p>
                <div className="methodologyTableScroller">
                  <table className="methodologyPoolTable">
                    <thead>
                      <tr>{t.methodologyPoolHeaders.map((header) => <th key={header} scope="col">{header}</th>)}</tr>
                    </thead>
                    <tbody>
                      {t.methodologyPoolRows.map((row) => (
                        <tr key={row[0]}>
                          {row.map((cell, index) => index === 0
                            ? <th key={cell} scope="row">{cell}</th>
                            : <td key={`${row[0]}-${index}`}>{cell}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="methodologyFormula">{t.methodologyPoolFormula}</p>
              </section>

              <section className="methodologySection" aria-labelledby="methodology-algorithm-title">
                <h3 id="methodology-algorithm-title">{t.methodologyAlgorithmTitle}</h3>
                <p>{t.methodologyAlgorithmIntro}</p>
                <div className="methodologyExample">
                  <strong>{t.methodologyHareExampleTitle}</strong>
                  <span>{t.methodologyHareExampleBody}</span>
                </div>
                <ol className="methodologySteps">
                  {t.methodologyAlgorithmSteps.map((step) => (
                    <li key={step.title}>
                      <div>
                        <strong>{step.title}</strong>
                        <p>{step.body}</p>
                        <small>{step.reference}</small>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              <section className="methodologySection" aria-labelledby="methodology-assumptions-title">
                <h3 id="methodology-assumptions-title">{t.methodologyAssumptionsTitle}</h3>
                <ul className="methodologyAssumptions">
                  {t.methodologyAssumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}
                </ul>
              </section>

              <section className="methodologySection" aria-labelledby="methodology-reading-title">
                <h3 id="methodology-reading-title">{t.methodologyReadingTitle}</h3>
                <p>{t.methodologyReadingBody}</p>
                <div className="methodologyChecklist">
                  <strong>{t.methodologyChecklistTitle}</strong>
                  <ul>{t.methodologyChecklist.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
              </section>

              <section className="methodologySection" aria-labelledby="methodology-sources-title">
                <h3 id="methodology-sources-title">{t.methodologySourcesTitle}</h3>
                <p>{t.methodologySourcesIntro}</p>
                <ul className="methodologySources">
                  {t.methodologySources.map((source) => (
                    <li key={source.href}>
                      <a href={source.href} target="_blank" rel="noreferrer">{source.label}</a>
                      <span>{source.body}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </details>
          {showMainMenu ? <section className="simulationSetup" aria-labelledby="simulation-setup-title">
            <div className="setupHeading">
              <h2 id="simulation-setup-title">{t.workflowTitle}</h2>
              <p>{t.workflowLead}</p>
            </div>
            <div className="setupActions">
              <fieldset className="lawModePicker">
                <legend>{t.simulationMode}</legend>
                {(["2026", "rosatellum", "comparison"] as const).map((mode) => (
                  <label key={mode}>
                    <input type="radio" name="simulation-mode" checked={simulationMode === mode} onChange={() => setSimulationMode(mode)} />
                    {mode === "2026" ? t.law2026 : mode === "rosatellum" ? t.lawRosatellum : t.lawComparison}
                  </label>
                ))}
              </fieldset>
              <p>{t.demoAlternative}</p>
              <div className="simulationCtas">
                <button type="button" className="primaryButton" onClick={() => void loadDemo()}>{t.loadDemo}</button>
                <button type="button" className="secondaryButton" aria-expanded={showCustomData} onClick={() => setShowCustomData((shown) => !shown)}>{t.importJsonCsv}</button>
              </div>
            </div>
            {showCustomData ? <section className="customDataSetup" aria-label={t.importJsonCsv}>
              <div className="setupSteps">
                <section className="setupStep">
                  <h3>{t.stepTwoTitle}</h3><p>{t.stepTwoBody}</p>
                  <button type="button" className="secondaryButton" onClick={() => void downloadSampleData()}>{t.downloadAndEdit}</button>
                </section>
                <section className="setupStep">
                  <h3>{t.stepThreeTitle}</h3><p>{t.stepThreeBody}</p>
                  <label className="fileButton">{t.importAllFiles}<input type="file" accept=".json,.csv,application/json,text/csv" multiple onChange={(event) => {
                    const files = event.target.files;
                    if (files?.length) void importFiles(files);
                  }} /></label>
                </section>
              </div>
              <details className="dataGuide">
                <summary>{t.requiredFiles}</summary>
                <dl>
                  <div><dt>{t.voteFiles}</dt><dd>{t.voteFilesBody}</dd></div>
                  <div><dt>{t.foreignFile}</dt><dd>{t.foreignFileBody}</dd></div>
                  <div><dt>{t.candidateFiles}</dt><dd>{t.candidateFilesBody}</dd></div>
                  <div><dt>{t.bonusFile}</dt><dd>{t.bonusFileBody}</dd></div>
                </dl>
              </details>
            </section> : null}
          </section> : null}
        </div>
      </section>

      {loadingStatus ? <div className="loadingBanner">{loadingStatus}</div> : null}
      {error ? <div className="alert">{error}</div> : null}
      {notice ? <div className="noticeBanner">{notice}</div> : null}

      {results && !showMainMenu ? (
        <section className={displayedSimulationMode === "comparison" ? "comparisonResults" : "resultCards"} aria-label={t.simulationResults}>
          {lawVersionsForMode[displayedSimulationMode].map((lawVersion) => {
            const result = results[lawVersion];
            if (!result) return null;
            return (
              <SimulationReport
                key={lawVersion}
                className={displayedSimulationMode === "comparison" ? "comparisonColumn" : undefined}
                title={displayedSimulationMode === "comparison" ? (lawVersion === "ac-2822-a-2026-07-16" ? t.law2026 : t.lawRosatellum) : undefined}
                scenario={scenario ? { ...scenario, lawVersion } : scenario}
                result={result}
                subjectNameById={subjectNameById}
                candidateById={candidateById}
                t={t}
                onSectionToggle={displayedSimulationMode === "comparison" ? (section, open) => {
                  document
                    .querySelectorAll<HTMLDetailsElement>(`details[data-report-section="${section}"]`)
                    .forEach((card) => {
                      if (card.open !== open) card.open = open;
                    });
                } : undefined}
              />
            );
          })}
        </section>
      ) : null}

      <div className="reportActions" aria-label={language === "it" ? "Contatta il progetto" : "Contact the project"}>
        <button type="button" className="reportButton iconButton" onClick={() => setReportKind("bug")} aria-label={t.reportBug} title={t.reportBug}>🐞</button>
        <button type="button" className="reportButton iconButton" onClick={() => setReportKind("feedback")} aria-label={t.giveFeedback} title={t.giveFeedback}>💬</button>
        <a className="reportButton githubButton iconButton" href="https://github.com/SimoneErba/italian-elections-simulator" target="_blank" rel="noreferrer" aria-label={t.viewOnGitHub} title={t.viewOnGitHub}>
          <svg aria-hidden="true" viewBox="0 0 16 16" focusable="false">
            <path d="M8 0C3.58 0 0 3.64 0 8.13c0 3.59 2.29 6.63 5.47 7.71.4.08.55-.18.55-.4 0-.2-.01-.86-.01-1.55-2.01.38-2.53-.5-2.69-.96-.09-.24-.48-.97-.82-1.17-.28-.16-.68-.56-.01-.57.63-.01 1.08.59 1.23.83.72 1.23 1.87.89 2.33.68.07-.53.28-.89.51-1.09-1.78-.21-3.64-.91-3.64-4.03 0-.89.31-1.62.82-2.19-.08-.21-.36-1.04.08-2.16 0 0 .67-.22 2.2.84A7.47 7.47 0 0 1 8 4.85c.68 0 1.36.09 2 .27 1.53-1.06 2.2-.84 2.2-.84.44 1.12.16 1.95.08 2.16.51.57.82 1.29.82 2.19 0 3.13-1.87 3.82-3.65 4.03.29.25.54.72.54 1.46 0 1.06-.01 1.91-.01 2.18 0 .22.15.48.55.4A8.03 8.03 0 0 0 16 8.13C16 3.64 12.42 0 8 0Z" />
          </svg>
        </a>
      </div>

      {reportKind ? (
        <ReportDialog
          key={reportKind}
          kind={reportKind}
          t={t}
          onClose={() => setReportKind(undefined)}
          onSent={() => setNotice(t.reportSent)}
        />
      ) : null}
    </main>
  );
}

function ReportDialog({
  kind,
  t,
  onClose,
  onSent
}: {
  kind: ReportKind;
  t: Translation;
  onClose: () => void;
  onSent: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string>();
  const title = kind === "bug" ? t.bugReportTitle : t.feedbackReportTitle;

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setSubmitting(true);

    try {
      const form = new FormData(event.currentTarget);
      const subject = String(form.get("subject") ?? "").trim();
      const description = String(form.get("description") ?? "").trim();
      const replyEmail = String(form.get("email") ?? "").trim();
      const submission = new FormData();
      submission.append("email", replyEmail);
      submission.append("subject", subject);
      submission.append("message", description);
      submission.append("report_type", kind);
      const response = await fetch(`https://formspree.io/f/${formspreeFormIdByReportKind[kind]}`, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: submission
      });
      if (!response.ok) throw new Error(await formspreeErrorMessage(response, t.reportSendFailed));
      onSent();
      setSubmitted(true);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : t.reportSendFailed);
      setSubmitting(false);
    }
  }

  return (
    <div className="dialogBackdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !submitting) onClose();
    }}>
      <form className="reportDialog" aria-modal="true" aria-labelledby="report-dialog-title" role="dialog" onSubmit={(event) => void submitReport(event)}>
        <div className="reportDialogHeader">
          <div>
            <h2 id="report-dialog-title">{title}</h2>
          </div>
          <button type="button" className="secondaryButton helpCloseButton" onClick={onClose} disabled={submitting} aria-label={t.reportCancel}>×</button>
        </div>
        {submitted ? (
          <>
            <p className="reportSuccess" role="status">{t.reportSent}</p>
            <div className="reportDialogActions">
              <button type="button" onClick={onClose}>{t.reportClose}</button>
            </div>
          </>
        ) : <>
          <label>
            <span>{t.reportSubject}</span>
            <input name="subject" required autoFocus />
          </label>
          <label>
            <span>{t.reportDescription}</span>
            <textarea name="description" required rows={6} />
          </label>
          <label>
            <span>{t.reportEmail}</span>
            <input name="email" type="email" />
          </label>
          {error ? <p className="reportError" role="alert">{error}</p> : null}
          <div className="reportDialogActions">
            <button type="button" className="secondaryButton" onClick={onClose} disabled={submitting}>{t.reportCancel}</button>
            <button type="submit" disabled={submitting}>{submitting ? t.reportPreparing : t.reportSend}</button>
          </div>
        </>}
      </form>
    </div>
  );
}

async function formspreeErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as { errors?: Array<{ message?: unknown }> };
    const message = payload.errors?.map((error) => error.message).find((value): value is string => typeof value === "string");
    return message ?? fallback;
  } catch {
    return fallback;
  }
}

function SimulationReport({
  className,
  title,
  scenario,
  result,
  subjectNameById,
  candidateById,
  t,
  onSectionToggle
}: {
  className?: string;
  title?: string;
  scenario?: ElectionInput;
  result: ElectionSimulationResult;
  subjectNameById: Map<string, string>;
  candidateById: Map<string, Candidate>;
  t: Translation;
  onSectionToggle?: (section: ReportSection, open: boolean) => void;
}) {
  return (
    <div className={className}>
      {title ? <h2 className="comparisonTitle">{title}</h2> : null}
      <div className="resultCards">
        <CollapsibleCard title={t.nationalResults} meta={`${nationalSubjectCount(result)} ${t.subjects}`} section="national" onToggle={onSectionToggle}>
          <ChamberResult chamber="camera" scenario={scenario} result={result} subjectNameById={subjectNameById} t={t} />
          <ChamberResult chamber="senate" scenario={scenario} result={result} subjectNameById={subjectNameById} t={t} />
        </CollapsibleCard>
        <CollapsibleCard title={t.parliamentArcs} meta={`${totalAssignedSeats(result)} ${t.seats}`} section="arcs" onToggle={onSectionToggle}>
          <ParliamentArcsOverview result={result} subjectNameById={subjectNameById} candidateById={candidateById} t={t} />
        </CollapsibleCard>
        <CollapsibleCard title={t.bonusDetails} meta={result.bonus.awarded ? t.bonusYes : t.bonusNo} section="bonus" onToggle={onSectionToggle}>
          <BonusReport scenario={scenario} result={result} subjectNameById={subjectNameById} candidateById={candidateById} t={t} />
        </CollapsibleCard>
        <CollapsibleCard title={t.proclaimedMembers} meta={`${proclaimedMemberCount(result)} ${t.names}`} section="members" onToggle={onSectionToggle}>
          <ElectedCandidatesReport result={result} subjectNameById={subjectNameById} candidateById={candidateById} t={t} />
        </CollapsibleCard>
        <CollapsibleCard title={t.constituencyReport} meta={`${scenario?.constituencies.length ?? 0} ${t.constituency.toLowerCase()}`} section="constituencies" onToggle={onSectionToggle}>
          <ConstituencyReport scenario={scenario} result={result} subjectNameById={subjectNameById} candidateById={candidateById} t={t} />
        </CollapsibleCard>
        <CollapsibleCard title={t.debugLog} meta={`${buildDebugRows(result, subjectNameById, candidateById, t).length} ${t.steps}`} section="debug" onToggle={onSectionToggle}>
          <DebugLog result={result} subjectNameById={subjectNameById} candidateById={candidateById} t={t} />
        </CollapsibleCard>
      </div>
    </div>
  );
}

function CollapsibleCard({
  title,
  meta,
  section,
  onToggle,
  children
}: {
  title: string;
  meta?: string;
  section: ReportSection;
  onToggle?: (section: ReportSection, open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <details
      className="resultCard"
      data-report-section={section}
      open={defaultReportSectionOpen[section]}
      onToggle={onToggle ? (event) => onToggle(section, event.currentTarget.open) : undefined}
    >
      <summary>
        <span>{title}</span>
        {meta ? <small>{meta}</small> : null}
      </summary>
      <div className="resultCardBody">{children}</div>
    </details>
  );
}

type ElectedSeat = {
  seatId: string;
  candidateId?: string;
  name: string;
  age: string;
  partyId: string;
  partyName: string;
  chamber: Chamber | "-";
  electedIn: string;
  nominationType: string;
  listPosition: number;
  color: string;
  warning?: string;
};

type ConstituencyCandidateRow = {
  key: string;
  name: string;
  chamber: Chamber;
  partyName: string;
  partyId: string;
  color: string;
  district: string;
  position: number;
  elected: boolean;
  reason: string;
};

function PartyDot({ color }: { color: string }) {
  return <span className="partySwatch" style={{ background: color }} />;
}

type FilterOption = {
  value: string;
  label: string;
};

function TextFilter({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="tableFilter">
      <span>{label}</span>
      <input type="search" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectFilter({
  label,
  value,
  options,
  allLabel,
  onChange
}: {
  label: string;
  value: string;
  options: FilterOption[];
  allLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="tableFilter">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function uniqueOptions(values: string[]): FilterOption[] {
  return [...new Set(values.filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, label: value }));
}

function includesFilter(value: string, filter: string): boolean {
  return normalizeFilterText(value).includes(normalizeFilterText(filter));
}

function normalizeFilterText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isOnDataScrutini(fileName: string, text: string, chamber: Chamber): boolean {
  const lowerName = fileName.toLowerCase();
  const header = text.split(/\r?\n/, 1)[0] ?? "";
  return (
    header.includes("COLLEGIO PLURINOMINALE") &&
    header.includes("VOTI LISTE") &&
    (chamber === "camera" ? lowerName.includes("camera") || text.includes("Camera Italia") : lowerName.includes("senato") || text.includes("Senato Italia"))
  );
}

function isCandidateList(fileName: string, text: string, chamber: Chamber): boolean {
  const lowerName = fileName.toLowerCase();
  const header = text.split(/\r?\n/, 1)[0] ?? "";
  return (
    header.includes("CollPlurinom") &&
    header.includes("descrlista") &&
    (chamber === "camera"
      ? lowerName.includes("camera") || text.includes("\"C\"")
      : lowerName.includes("senato") || text.includes("\"S\""))
  );
}

function findBonusFile(
  texts: Array<{ file: File; text: string }>,
  predicate: (text: string) => boolean
): { file: File; text: string } | undefined {
  const matches = texts.filter(({ file, text }) => isBonusFile(file.name) && predicate(text));
  return matches.find(({ file }) => !isRandomBonusFile(file.name)) ?? matches[0];
}

function isBonusFile(fileName: string): boolean {
  const lowerName = fileName.toLowerCase();
  return lowerName.includes("bonus");
}

function isRandomBonusFile(fileName: string): boolean {
  return fileName.toLowerCase().includes("random");
}

function isLegacyBonusNominationFile(text: string): boolean {
  const header = text.split(/\r?\n/, 1)[0] ?? "";
  return header.includes("constituencyId") && header.includes("listId") && header.includes("candidateId");
}

function isBonusCandidateListFile(text: string): boolean {
  const header = text.split(/\r?\n/, 1)[0] ?? "";
  return (
    header.includes("candidateId") &&
    header.includes("position") &&
    (header.includes("connectedSubjectId") || header.includes("coalitionId") || header.includes("subjectId"))
  );
}

function isForeignElectionJson(fileName: string, text: string): boolean {
  if (!fileName.toLowerCase().endsWith(".json")) return false;
  try {
    const parsed = JSON.parse(text) as { election?: unknown; chambers?: { camera?: unknown; senato?: unknown } };
    return parsed.election === "politiche-2022" && Boolean(parsed.chambers?.camera && parsed.chambers?.senato);
  } catch {
    return false;
  }
}

function isSpecialTerritoriesJson(fileName: string, text: string): boolean {
  if (!fileName.toLowerCase().endsWith(".json")) return false;
  try {
    const parsed = JSON.parse(text) as { districts?: unknown };
    return Array.isArray(parsed.districts);
  } catch {
    return false;
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

type ZipFile = {
  name: string;
  data: Uint8Array<ArrayBuffer>;
};

type PreparedZipFile = ZipFile & {
  compressedData: Uint8Array<ArrayBuffer>;
  compressionMethod: 0 | 8;
};

async function buildZip(files: ZipFile[]): Promise<Blob> {
  const encoder = new TextEncoder();
  const localParts: Array<Uint8Array<ArrayBuffer>> = [];
  const centralParts: Array<Uint8Array<ArrayBuffer>> = [];
  let offset = 0;

  for (const file of files) {
    const preparedFile = await prepareZipFile(file);
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const localHeader = createZipLocalHeader(name, crc, preparedFile.compressedData.length, file.data.length, preparedFile.compressionMethod);
    const centralHeader = createZipCentralHeader(name, crc, preparedFile.compressedData.length, file.data.length, preparedFile.compressionMethod, offset);
    localParts.push(localHeader, preparedFile.compressedData);
    centralParts.push(centralHeader);
    offset += localHeader.byteLength + preparedFile.compressedData.byteLength;
  }

  const centralDirectorySize = centralParts.reduce((sum, part) => sum + part.byteLength, 0);
  const endRecord = createZipEndRecord(files.length, centralDirectorySize, offset);
  return new Blob([...localParts, ...centralParts, endRecord], { type: "application/zip" });
}

async function prepareZipFile(file: ZipFile): Promise<PreparedZipFile> {
  if (typeof CompressionStream === "undefined") {
    return { ...file, compressedData: file.data, compressionMethod: 0 };
  }
  const compressedBuffer = await new Response(
    new Blob([file.data]).stream().pipeThrough(new CompressionStream("deflate-raw"))
  ).arrayBuffer();
  const compressedData = new Uint8Array(compressedBuffer);
  return compressedData.length < file.data.length
    ? { ...file, compressedData, compressionMethod: 8 }
    : { ...file, compressedData: file.data, compressionMethod: 0 };
}

function createZipLocalHeader(
  name: Uint8Array<ArrayBuffer>,
  crc: number,
  compressedSize: number,
  uncompressedSize: number,
  compressionMethod: 0 | 8
): Uint8Array<ArrayBuffer> {
  const header = new Uint8Array(30 + name.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, compressionMethod, true);
  writeZipTimestamp(view, 10);
  view.setUint32(14, crc, true);
  view.setUint32(18, compressedSize, true);
  view.setUint32(22, uncompressedSize, true);
  view.setUint16(26, name.length, true);
  view.setUint16(28, 0, true);
  header.set(name, 30);
  return header;
}

function createZipCentralHeader(
  name: Uint8Array<ArrayBuffer>,
  crc: number,
  compressedSize: number,
  uncompressedSize: number,
  compressionMethod: 0 | 8,
  localOffset: number
): Uint8Array<ArrayBuffer> {
  const header = new Uint8Array(46 + name.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, compressionMethod, true);
  writeZipTimestamp(view, 12);
  view.setUint32(16, crc, true);
  view.setUint32(20, compressedSize, true);
  view.setUint32(24, uncompressedSize, true);
  view.setUint16(28, name.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, localOffset, true);
  header.set(name, 46);
  return header;
}

function createZipEndRecord(fileCount: number, centralDirectorySize: number, centralDirectoryOffset: number): Uint8Array<ArrayBuffer> {
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, fileCount, true);
  view.setUint16(10, fileCount, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  view.setUint16(20, 0, true);
  return record;
}

function writeZipTimestamp(view: DataView, offset: number) {
  const date = new Date();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  view.setUint16(offset, dosTime, true);
  view.setUint16(offset + 2, dosDate, true);
}

let crc32Table: Uint32Array<ArrayBuffer> | undefined;

function crc32(data: Uint8Array<ArrayBuffer>): number {
  const table = crc32Table ?? buildCrc32Table();
  crc32Table = table;
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildCrc32Table(): Uint32Array<ArrayBuffer> {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

function buildSubjectNameById(scenario: ElectionInput | undefined): Map<string, string> {
  const names = new Map([
    ...(scenario?.lists.map((list) => [list.id, list.name] as const) ?? []),
    ...(scenario?.coalitions.map((coalition) => [coalition.id, coalition.alias ?? coalition.name] as const) ?? [])
  ]);
  for (const chamber of Object.values(scenario?.foreignElection?.chambers ?? {})) {
    for (const partition of chamber.partitions) {
      for (const list of partition.lists) names.set(list.id, list.name);
    }
  }
  return names;
}

function buildCandidateById(scenario: ElectionInput | undefined): Map<string, Candidate> {
  const candidates = new Map(scenario?.candidates?.map((candidate) => [candidate.id, candidate]) ?? []);
  for (const nomination of scenario?.nominations ?? []) {
    const candidate = candidates.get(nomination.candidateId);
    if (candidate && !candidate.party) {
      candidates.set(candidate.id, { ...candidate, party: nomination.listId });
    }
  }
  return candidates;
}

function failImport(message: string): never {
  throw new Error(message);
}

function formatTerritoryName(territoryId: string, scenario: ElectionInput | undefined): string {
  const territoryName =
    scenario?.constituencies.find((constituency) => constituency.id === territoryId)?.name ??
    scenario?.multiMemberDistricts.find((district) => district.id === territoryId)?.name ??
    scenario?.singleMemberDistricts?.find((district) => district.id === territoryId)?.name;
  if (territoryName) return territoryName;

  return territoryId
    .replace(/^(camera|senate)-/, "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

type DebugRow = {
  step: string;
  chamber: string;
  seats: number;
  bonusSeats: number;
  details: string;
};

function BonusReport({
  scenario,
  result,
  subjectNameById,
  candidateById,
  t
}: {
  scenario: ElectionInput | undefined;
  result: ElectionSimulationResult;
  subjectNameById: Map<string, string>;
  candidateById: Map<string, Candidate>;
  t: Translation;
}) {
  const winnerName = result.bonus.winnerId ? subjectNameById.get(result.bonus.winnerId) ?? result.bonus.winnerId : "-";
  const winnerSeatLimits = useMemo(() => {
    if (!result.bonus.awarded || !result.bonus.winnerId || result.lawVersion !== "ac-2822-a-2026-07-16") return [];
    const rules = getLawVersion(result.lawVersion).chamberRules;
    return (["camera", "senate"] as const).flatMap((chamber) => {
      const limit = rules[chamber].maxWinnerSeatsWithBonus;
      const seats = result.nationalResults[chamber]?.seats[result.bonus.winnerId!] ?? 0;
      return seats >= limit ? [`${formatChamber(chamber, t)}: ${seats}/${limit}`] : [];
    });
  }, [result, t]);
  const bonusSeats = buildElectedSeats(result, subjectNameById, candidateById)
    .filter((seat) => seat.nominationType === "bonus-priority-list")
    .sort((a, b) => formatChamber(a.chamber, t).localeCompare(formatChamber(b.chamber, t)) || a.listPosition - b.listPosition || a.name.localeCompare(b.name));
  const [nameFilter, setNameFilter] = useState("");
  const [chamberFilter, setChamberFilter] = useState("");
  const [partyFilter, setPartyFilter] = useState("");
  const [territoryFilter, setTerritoryFilter] = useState("");
  const partyOptions = useMemo(() => uniqueOptions(bonusSeats.map((seat) => seat.partyName)), [bonusSeats]);
  const chamberOptions = useMemo(() => uniqueOptions(bonusSeats.map((seat) => formatChamber(seat.chamber, t))), [bonusSeats, t]);
  const filteredBonusSeats = bonusSeats.filter((seat) => {
    const territoryName = formatTerritoryName(seat.electedIn, scenario);
    return (
      (!nameFilter || includesFilter(seat.name, nameFilter)) &&
      (!chamberFilter || formatChamber(seat.chamber, t) === chamberFilter) &&
      (!partyFilter || seat.partyName === partyFilter) &&
      (!territoryFilter || includesFilter(territoryName, territoryFilter))
    );
  });

  return (
    <div className="bonusReport">
      <dl className="bonusSummary">
        <div>
          <dt>{t.bonusStatus}</dt>
          <dd>{result.bonus.awarded ? t.bonusYes : t.bonusNo}</dd>
        </div>
        <div>
          <dt>{t.bonusWinner}</dt>
          <dd>{result.bonus.awarded ? winnerName : "-"}</dd>
        </div>
        <div>
          <dt>{formatChamber("camera", t)}</dt>
          <dd>{bonusSeatsFor(result, "camera")} {t.seats}</dd>
        </div>
        <div>
          <dt>{formatChamber("senate", t)}</dt>
          <dd>{bonusSeatsFor(result, "senate")} {t.seats}</dd>
        </div>
      </dl>

      {!result.bonus.awarded && result.bonus.failedConditions.length > 0 ? (
        <div className="unresolvedBox">
          <h3>{t.bonusFailureReasons}</h3>
          <ul>
            {result.bonus.failedConditions.map((condition) => (
              <li key={condition}>{condition}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {winnerSeatLimits.length > 0 ? (
        <div className="bonusLimitNotice" role="status">
          <h3>{t.bonusSeatLimitReached}</h3>
          <p>{t.bonusSeatLimitDetail.replace("{limits}", winnerSeatLimits.join(", "))}</p>
        </div>
      ) : null}

      <h3 className="subsectionTitle">{t.bonusPeople}</h3>
      {bonusSeats.length === 0 ? (
        <p className="muted">{t.bonusNoPeople}</p>
      ) : (
        <>
          <div className="tableFilters">
            <TextFilter label={t.name} value={nameFilter} onChange={setNameFilter} />
            <SelectFilter label={t.chamber} value={chamberFilter} options={chamberOptions} allLabel={t.all} onChange={setChamberFilter} />
            <SelectFilter label={t.party} value={partyFilter} options={partyOptions} allLabel={t.all} onChange={setPartyFilter} />
            <TextFilter label={t.electedIn} value={territoryFilter} onChange={setTerritoryFilter} />
          </div>
          {filteredBonusSeats.length === 0 ? (
            <p className="muted">{t.noRows}</p>
          ) : (
            <div className="tableScroller">
              <table>
                <thead>
                  <tr>
                    <th>{t.name}</th>
                    <th>{t.chamber}</th>
                    <th className="colorColumn" aria-label={t.party}></th>
                    <th>{t.party}</th>
                    <th>{t.electedIn}</th>
                    <th>{t.position}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBonusSeats.map((seat) => (
                    <tr key={seat.seatId}>
                      <td>{seat.name}</td>
                      <td>{formatChamber(seat.chamber, t)}</td>
                      <td className="colorColumn">
                        <PartyDot color={seat.color} />
                      </td>
                      <td>{seat.partyName}</td>
                      <td>{formatTerritoryName(seat.electedIn, scenario)}</td>
                      <td>{seat.listPosition}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DebugLog({
  result,
  subjectNameById,
  candidateById,
  t
}: {
  result: ElectionSimulationResult;
  subjectNameById: Map<string, string>;
  candidateById: Map<string, Candidate>;
  t: Translation;
}) {
  const rows = buildDebugRows(result, subjectNameById, candidateById, t);
  const [stepFilter, setStepFilter] = useState("");
  const [chamberFilter, setChamberFilter] = useState("");
  const [detailFilter, setDetailFilter] = useState("");
  const stepOptions = useMemo(() => uniqueOptions(rows.map((row) => row.step)), [rows]);
  const chamberOptions = useMemo(() => uniqueOptions(rows.map((row) => row.chamber)), [rows]);
  const filteredRows = rows.filter(
    (row) =>
      (!stepFilter || row.step === stepFilter) &&
      (!chamberFilter || row.chamber === chamberFilter) &&
      (!detailFilter || includesFilter(row.details, detailFilter))
  );

  return (
    <div className="debugLog">
      <div className="tableFilters">
        <SelectFilter label={t.step} value={stepFilter} options={stepOptions} allLabel={t.all} onChange={setStepFilter} />
        <SelectFilter label={t.chamber} value={chamberFilter} options={chamberOptions} allLabel={t.all} onChange={setChamberFilter} />
        <TextFilter label={t.detail} value={detailFilter} onChange={setDetailFilter} />
      </div>
      <table className="nationalResultsTable">
        <colgroup>
          <col className="debugStepColumn" />
          <col className="debugChamberColumn" />
          <col className="nationalVotesColumn" />
          <col className="nationalPercentColumn" />
          <col className="debugDetailColumn" />
        </colgroup>
        <thead>
          <tr>
            <th>{t.step}</th>
            <th>{t.chamber}</th>
            <th>{t.seatsColumn}</th>
            <th>Bonus</th>
            <th>{t.detail}</th>
          </tr>
        </thead>
        <tbody>
          {filteredRows.map((row) => (
            <tr key={`${row.step}-${row.chamber}`}>
              <td>{row.step}</td>
              <td>{row.chamber}</td>
              <td>{row.seats}</td>
              <td>{row.bonusSeats}</td>
              <td>{row.details}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChamberResult({
  chamber,
  scenario,
  result,
  subjectNameById,
  t
}: {
  chamber: Chamber;
  scenario: ElectionInput | undefined;
  result: ElectionSimulationResult;
  subjectNameById: Map<string, string>;
  t: Translation;
}) {
  const national = result.nationalResults[chamber];
  const [expandedCoalitions, setExpandedCoalitions] = useState<Set<string>>(() => new Set());
  const coalitionById = useMemo(() => new Map(scenario?.coalitions.map((coalition) => [coalition.id, coalition]) ?? []), [scenario]);
  const displayVoteTotals = useMemo(() => {
    if (!scenario) return undefined;
    const totals = aggregateVotes(scenario, true)[chamber];

    // Special direct mandates have candidate tallies rather than list-vote
    // rows. Include the winning tally in the results display without feeding
    // it into the proportional allocation. Camera Trentino-Alto Adige keeps
    // its ordinary list-vote rows, so only its Valle d'Aosta mandate is added.
    const directVoteDistrictIds = new Set(
      (scenario.singleMemberDistricts ?? [])
        .filter(
          (district) =>
            district.chamber === chamber &&
            district.specialTerritory &&
            (chamber === "senate" || district.specialTerritory === "valle-aosta")
        )
        .map((district) => district.id)
    );
    for (const candidateVote of scenario.candidateVotes ?? []) {
      if (candidateVote.chamber !== chamber || !directVoteDistrictIds.has(candidateVote.districtId)) continue;
      const nomination = (scenario.nominations ?? []).find(
        (item) => item.candidateId === candidateVote.candidateId && item.chamber === chamber &&
          item.districtId === candidateVote.districtId && item.nominationType === "single-member"
      );
      if (!nomination) continue;
      const subjectId = nomination.connectedSubjectId ?? nomination.listId;
      totals.listVotes[nomination.listId] = (totals.listVotes[nomination.listId] ?? 0n) + candidateVote.votes;
      totals.subjectVotes[subjectId] = (totals.subjectVotes[subjectId] ?? 0n) + candidateVote.votes;
      totals.totalValidVotes += candidateVote.votes;
    }
    return totals;
  }, [scenario, chamber]);
  const rows = national ? Object.entries(national.seats).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) : [];
  if (!national) return null;
  const displayTotalValidVotes = displayVoteTotals?.totalValidVotes ?? national.totalValidVotes;
  const listVoteTotals = displayVoteTotals?.listVotes ?? {};
  const subjectVoteTotals = displayVoteTotals?.subjectVotes ?? national.votes;
  const toggleCoalition = (coalitionId: string) => {
    setExpandedCoalitions((current) => {
      const next = new Set(current);
      if (next.has(coalitionId)) {
        next.delete(coalitionId);
      } else {
        next.add(coalitionId);
      }
      return next;
    });
  };

  return (
    <div className="chamberBlock">
      <div className="chamberHeader">
        <h3>{formatChamber(chamber, t)}</h3>
        <span>{formatBigInt(displayTotalValidVotes)} {t.validVotes}</span>
      </div>
      <div className="tableScroller">
      <table className="nationalResultsTable">
        <colgroup>
          <col className="tableDotColumn" />
          <col className="nationalSubjectColumn" />
          <col className="nationalVotesColumn" />
          <col className="nationalPercentColumn" />
          <col className="nationalSeatsColumn" />
        </colgroup>
        <thead>
          <tr>
            <th className="colorColumn" aria-label={t.party}></th>
            <th>{t.listCoalition}</th>
            <th>{t.votes}</th>
            <th>%</th>
            <th>{t.seatsColumn}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([subjectId, seats]) => {
            const coalition = coalitionById.get(subjectId);
            const isExpanded = expandedCoalitions.has(subjectId);
            const subjectVotes = subjectVoteTotals[subjectId];
            const subjectPercent = subjectVotes === undefined ? undefined : percentage(subjectVotes, displayTotalValidVotes);
            return (
              <Fragment key={subjectId}>
                <tr key={subjectId}>
                  <td className="colorColumn">
                    <PartyDot color={partyColor(subjectId)} />
                  </td>
                  <td>
                    {coalition ? (
                      <button
                        type="button"
                        className="rowToggleButton"
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? t.hideParties : t.showParties}: ${subjectNameById.get(subjectId) ?? subjectId}`}
                        onClick={() => toggleCoalition(subjectId)}
                      >
                        <span className="rowToggleIcon" aria-hidden="true">{isExpanded ? "⌃" : "⌄"}</span>
                        <span>{subjectNameById.get(subjectId) ?? subjectId}</span>
                      </button>
                    ) : (
                      subjectNameById.get(subjectId) ?? subjectId
                    )}
                  </td>
                  <td>{formatBigInt(subjectVotes ?? 0n)}</td>
                  <td>{subjectPercent ? formatPercent(subjectPercent) : "-"}</td>
                  <td>{seats}</td>
                </tr>
                {coalition && isExpanded
                  ? [...coalition.listIds].sort((a, b) => {
                      const voteDifference = (listVoteTotals[b] ?? 0n) - (listVoteTotals[a] ?? 0n);
                      if (voteDifference !== 0n) return voteDifference > 0n ? 1 : -1;
                      return (subjectNameById.get(a) ?? a).localeCompare(subjectNameById.get(b) ?? b);
                    }).map((listId) => {
                      const votes = listVoteTotals[listId] ?? 0n;
                      return (
                        <tr className="coalitionPartyRow" key={`${subjectId}-${listId}`}>
                          <td className="colorColumn">
                            <PartyDot color={partyColor(listId)} />
                          </td>
                          <td>{subjectNameById.get(listId) ?? listId}</td>
                          <td>{formatBigInt(votes)}</td>
                          <td>{formatPercent(percentage(votes, displayTotalValidVotes))}</td>
                          <td></td>
                        </tr>
                      );
                    })
                  : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function ParliamentArcsOverview({
  result,
  subjectNameById,
  candidateById,
  t
}: {
  result: ElectionSimulationResult;
  subjectNameById: Map<string, string>;
  candidateById: Map<string, Candidate>;
  t: Translation;
}) {
  const cameraSeats = useMemo(() => buildParliamentSeats(result, subjectNameById, candidateById, t, "camera"), [result, subjectNameById, candidateById, t]);
  const senateSeats = useMemo(() => buildParliamentSeats(result, subjectNameById, candidateById, t, "senate"), [result, subjectNameById, candidateById, t]);
  const [activeCameraSeatId, setActiveCameraSeatId] = useState<string>();
  const [activeSenateSeatId, setActiveSenateSeatId] = useState<string>();
  const activeCameraSeat = findActiveSeat(cameraSeats, activeCameraSeatId);
  const activeSenateSeat = findActiveSeat(senateSeats, activeSenateSeatId);

  return (
    <div className="parliamentGrid">
      <ParliamentLegend seats={[...cameraSeats, ...senateSeats]} t={t} />
      <ParliamentArc chamber="camera" seats={cameraSeats} activeSeat={activeCameraSeat} setActiveSeatId={setActiveCameraSeatId} t={t} />
      <ParliamentArc chamber="senate" seats={senateSeats} activeSeat={activeSenateSeat} setActiveSeatId={setActiveSenateSeatId} t={t} />
      <SeatInspector activeSeat={activeCameraSeat} seats={cameraSeats} t={t} />
      <SeatInspector activeSeat={activeSenateSeat} seats={senateSeats} t={t} />
    </div>
  );
}

function ParliamentArc({
  chamber,
  seats,
  activeSeat,
  setActiveSeatId,
  t
}: {
  chamber: Chamber;
  seats: ElectedSeat[];
  activeSeat: ElectedSeat | undefined;
  setActiveSeatId: (seatId: string) => void;
  t: Translation;
}) {
  const layout = useMemo(() => buildVerticalArcLayout(seats.length), [seats.length]);
  const chamberName = formatChamber(chamber, t);

  return (
    <div className="parliamentBlock">
      <div className="sectionHeader">
        <div>
          <h2>{chamberName}</h2>
        </div>
      </div>
      {seats.length === 0 ? (
        <p className="muted">{t.noSeatsForChart}</p>
      ) : (
        <div className="parliamentLayout">
          <svg className="parliamentArc" viewBox="-8 -4 116 72" role="img" aria-label={`${t.parliamentArc} ${chamberName}`}>
            {seats.map((seat, index) => {
              const point = layout[index];
              return (
                <circle
                  key={seat.seatId}
                  cx={point.x}
                  cy={point.y}
                  r={point.r}
                  fill={seat.color}
                  className={seat.seatId === activeSeat?.seatId ? "seatDot active" : "seatDot"}
                  tabIndex={0}
                  role="button"
                  aria-label={`${seat.name}, ${seat.partyName}`}
                  onClick={() => setActiveSeatId(seat.seatId)}
                  onFocus={() => setActiveSeatId(seat.seatId)}
                  onMouseEnter={() => setActiveSeatId(seat.seatId)}
                >
                  <title>{`${seat.name} - ${seat.partyName} - ${t.age.toLowerCase()} ${seat.age}`}</title>
                </circle>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}

function findActiveSeat(seats: ElectedSeat[], activeSeatId: string | undefined): ElectedSeat | undefined {
  return seats.find((seat) => seat.seatId === activeSeatId) ?? seats.find((seat) => seat.candidateId) ?? seats[0];
}

function SeatInspector({ activeSeat, seats, t }: { activeSeat: ElectedSeat | undefined; seats: ElectedSeat[]; t: Translation }) {
  const missingSeats = seats.length - seats.filter((seat) => seat.candidateId).length;

  return (
    <div className="parliamentInspectorBlock">
      {activeSeat ? (
        <div className="seatInspector">
          <span className="partySwatch" style={{ background: activeSeat.color }} />
          <h3>{activeSeat.name}</h3>
          <dl>
            <div>
              <dt>{t.age}</dt>
              <dd>{activeSeat.age}</dd>
            </div>
            <div>
              <dt>{t.party}</dt>
              <dd>{activeSeat.partyName}</dd>
            </div>
            <div>
              <dt>{t.electedIn}</dt>
              <dd>{activeSeat.electedIn}</dd>
            </div>
            {activeSeat.warning ? (
              <div>
                <dt>{t.warning}</dt>
                <dd>{activeSeat.warning}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}
      {missingSeats > 0 ? (
        <p className="muted missingSeatsNote">
          {missingSeats} {t.missingSeatsNote}
        </p>
      ) : null}
    </div>
  );
}

function ParliamentLegend({
  seats,
  t
}: {
  seats: ElectedSeat[];
  t: Translation;
}) {
  const legendRows = useMemo(() => buildParliamentLegendRows(seats), [seats]);
  if (legendRows.length === 0) return null;

  return (
    <div className="parliamentLegend" aria-label={t.legend}>
      <h3>{t.legend}</h3>
      <ul>
        {legendRows.map((row) => (
          <li key={row.partyId}>
            <span className="partySwatch" style={{ background: row.color }} />
            <span className="parliamentLegendName">{row.partyName}</span>
            <span className="parliamentLegendSeats">{row.seats} {t.seats}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConstituencyReport({
  scenario,
  result,
  subjectNameById,
  candidateById,
  t
}: {
  scenario: ElectionInput | undefined;
  result: ElectionSimulationResult;
  subjectNameById: Map<string, string>;
  candidateById: Map<string, Candidate>;
  t: Translation;
}) {
  const groups = buildConstituencyGroups(scenario, result, subjectNameById, candidateById, t);
  const [constituencyFilter, setConstituencyFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [partyFilter, setPartyFilter] = useState("");
  const partyOptions = useMemo(() => uniqueOptions(groups.flatMap((group) => group.rows.map((row) => row.partyName))), [groups]);
  const filteredGroups = groups
    .map((group) => ({
      ...group,
      rows: group.rows.filter(
        (row) =>
          (!constituencyFilter || includesFilter(group.name, constituencyFilter)) &&
          (!nameFilter || includesFilter(row.name, nameFilter)) &&
          (!partyFilter || row.partyName === partyFilter)
      )
    }))
    .filter((group) => group.rows.length > 0);

  if (groups.length === 0) return <p className="muted">{t.noRows}</p>;

  return (
    <div className="constituencyReport">
      <div className="tableFilters">
        <TextFilter label={t.constituency} value={constituencyFilter} onChange={setConstituencyFilter} />
        <TextFilter label={t.name} value={nameFilter} onChange={setNameFilter} />
        <SelectFilter label={t.party} value={partyFilter} options={partyOptions} allLabel={t.all} onChange={setPartyFilter} />
      </div>
      {filteredGroups.length === 0 ? <p className="muted">{t.noRows}</p> : null}
      {filteredGroups.map((group) => {
        const elected = group.rows.filter((row) => row.elected);
        const notElected = group.rows.filter((row) => !row.elected);
        return (
          <details className="constituencyBlock" key={group.id}>
            <summary>
              <span>{group.name}</span>
              <small>{elected.length} {t.elected}, {notElected.length} {t.notElected}</small>
            </summary>
            <CandidateOutcomeTable rows={elected} title={t.elected} t={t} />
            <CandidateOutcomeTable rows={notElected} title={t.notElected} t={t} />
          </details>
        );
      })}
    </div>
  );
}

function CandidateOutcomeTable({ rows, title, t }: { rows: ConstituencyCandidateRow[]; title: string; t: Translation }) {
  return (
    <div className="candidateOutcomeGroup">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="muted">{t.noRows}</p>
      ) : (
        <div className="tableScroller">
          <table>
            <thead>
              <tr>
                <th>{t.name}</th>
                <th className="colorColumn" aria-label={t.party}></th>
                <th>{t.party}</th>
                <th>{t.position}</th>
                <th>{t.reason}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>{row.name}</td>
                  <td className="colorColumn">
                    <span className="partySwatch" style={{ background: row.color }} />
                  </td>
                  <td>
                    {row.partyName}
                  </td>
                  <td>{row.position}</td>
                  <td>{row.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ElectedCandidatesReport({
  result,
  subjectNameById,
  candidateById,
  t
}: {
  result: ElectionSimulationResult;
  subjectNameById: Map<string, string>;
  candidateById: Map<string, Candidate>;
  t: Translation;
}) {
  const pageSize = 25;
  const electedRows = buildElectedSeats(result, subjectNameById, candidateById);
  const [currentPage, setCurrentPage] = useState(1);
  const [nameFilter, setNameFilter] = useState("");
  const [partyFilter, setPartyFilter] = useState("");
  const [chamberFilter, setChamberFilter] = useState("");
  const [territoryFilter, setTerritoryFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const partyOptions = useMemo(() => uniqueOptions(electedRows.map((row) => row.partyName)), [electedRows]);
  const chamberOptions = useMemo(() => uniqueOptions(electedRows.map((row) => formatChamber(row.chamber, t))), [electedRows, t]);
  const typeOptions = useMemo(() => uniqueOptions(electedRows.map((row) => row.nominationType)), [electedRows]);
  const filteredRows = electedRows.filter(
    (row) =>
      (!nameFilter || includesFilter(row.name, nameFilter)) &&
      (!partyFilter || row.partyName === partyFilter) &&
      (!chamberFilter || formatChamber(row.chamber, t) === chamberFilter) &&
      (!territoryFilter || includesFilter(row.electedIn, territoryFilter)) &&
      (!typeFilter || row.nominationType === typeFilter)
  );
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, pageCount);
  const pageStart = (safeCurrentPage - 1) * pageSize;
  const pageRows = filteredRows.slice(pageStart, pageStart + pageSize);
  const assignedSeats = buildParliamentSeats(result, subjectNameById, candidateById, t);
  const missingSeats = assignedSeats.length - electedRows.length;
  const unresolvedCandidateStages = result.ties.filter((tie) => tie.stage.includes("candidati") || tie.stage.includes("proclamazione"));

  useEffect(() => {
    setCurrentPage(1);
  }, [result, subjectNameById, candidateById, nameFilter, partyFilter, chamberFilter, territoryFilter, typeFilter]);

  return (
    <div className="candidateReport">
      <div className="candidateReportHeader">
        <h2>{t.proclaimedMembers}</h2>
        {electedRows.length > 0 ? (
          <button type="button" className="secondaryButton" onClick={() => downloadElectedCandidatesCsv(electedRows, t)}>
            {t.downloadCsv}
          </button>
        ) : null}
      </div>
      {electedRows.length === 0 ? (
        <p className="muted">{t.noCandidates}</p>
      ) : (
        <>
          <div className="tableFilters">
            <TextFilter label={t.name} value={nameFilter} onChange={setNameFilter} />
            <SelectFilter label={t.party} value={partyFilter} options={partyOptions} allLabel={t.all} onChange={setPartyFilter} />
            <SelectFilter label={t.chamber} value={chamberFilter} options={chamberOptions} allLabel={t.all} onChange={setChamberFilter} />
            <TextFilter label={t.electedIn} value={territoryFilter} onChange={setTerritoryFilter} />
            <SelectFilter label={t.type} value={typeFilter} options={typeOptions} allLabel={t.all} onChange={setTypeFilter} />
          </div>
          {filteredRows.length === 0 ? (
            <p className="muted">{t.noRows}</p>
          ) : (
            <div className="tableScroller">
              <table>
                <thead>
                  <tr>
                    <th>{t.name}</th>
                    <th>{t.age}</th>
                    <th className="colorColumn" aria-label={t.party}></th>
                    <th>{t.party}</th>
                    <th>{t.chamber}</th>
                    <th>{t.electedIn}</th>
                    <th>{t.position}</th>
                    <th>{t.type}</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((candidate) => (
                    <tr key={candidate.seatId}>
                      <td>{candidate.name}</td>
                      <td>{candidate.age}</td>
                      <td className="colorColumn">
                        <PartyDot color={candidate.color} />
                      </td>
                      <td>{candidate.partyName}</td>
                      <td>{formatChamber(candidate.chamber, t)}</td>
                      <td>{candidate.electedIn}</td>
                      <td>{candidate.listPosition}</td>
                      <td>{candidate.nominationType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="paginationControls">
            <span>
              {filteredRows.length === 0 ? 0 : pageStart + 1}-{Math.min(pageStart + pageSize, filteredRows.length)} {t.of} {filteredRows.length}
            </span>
            <div>
              <button type="button" className="secondaryButton" disabled={safeCurrentPage === 1} onClick={() => setCurrentPage(1)}>
                {t.first}
              </button>
              <button type="button" className="secondaryButton" disabled={safeCurrentPage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>
                {t.previous}
              </button>
              <span>{t.page} {safeCurrentPage} {t.of} {pageCount}</span>
              <button
                type="button"
                className="secondaryButton"
                disabled={safeCurrentPage === pageCount}
                onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
              >
                {t.next}
              </button>
              <button type="button" className="secondaryButton" disabled={safeCurrentPage === pageCount} onClick={() => setCurrentPage(pageCount)}>
                {t.last}
              </button>
            </div>
          </div>
        </>
      )}
      {missingSeats > 0 ? (
        <div className="unresolvedBox">
          <h3>{t.seatsWithoutName}</h3>
          <p>
            {missingSeats} {t.seatsWithoutNameBody}
          </p>
        </div>
      ) : null}
      {unresolvedCandidateStages.length > 0 ? (
        <div className="unresolvedBox">
          <h3>{t.unresolvedCandidates}</h3>
          <ul>
            {unresolvedCandidateStages.map((tie) => (
              <li key={`${tie.stage}-${tie.affectedSeats.join("-")}`}>
                <strong>{tie.stage}</strong>: {tie.subjects.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function buildElectedSeats(
  result: ElectionSimulationResult,
  subjectNameById: Map<string, string>,
  candidateById: Map<string, Candidate>
): ElectedSeat[] {
  const nationalSeats = result.electedCandidates
    .map((elected) => {
      const trace = result.seatTrace.find((entry) => entry.seatId === elected.seatId);
      const candidate = candidateById.get(elected.candidateId);
      const partyId = candidate?.party ?? trace?.partyId ?? "unknown";
      const name = candidate ? `${candidate.lastName} ${candidate.firstName}` : elected.candidateId;
      const chamber: Chamber | "-" = trace?.chamber ?? "-";
      return {
        seatId: elected.seatId,
        candidateId: elected.candidateId,
        name,
        age: formatCandidateAge(candidate),
        partyId,
        partyName: subjectNameById.get(partyId) ?? partyId,
        chamber,
        electedIn: elected.electedIn,
        nominationType: elected.nominationType,
        listPosition: elected.listPosition,
        color: partyColor(partyId)
      };
    })
    .sort((a, b) => {
      const chamberOrder = String(a.chamber).localeCompare(String(b.chamber));
      return chamberOrder || a.partyName.localeCompare(b.partyName) || a.name.localeCompare(b.name);
    });
  const foreignSeats = Object.values(result.foreignResults)
    .filter((foreignResult) => foreignResult !== undefined)
    .flatMap((foreignResult) =>
      foreignResult.electedCandidates.map((elected) => {
        const chamber: Chamber = foreignResult.chamber === "senato" ? "senate" : "camera";
        const candidateId = elected.candidate.id ?? `foreign-${foreignResult.chamber}-${elected.partitionId}-${elected.listId}-${elected.candidate.list_position}`;
        return {
          seatId: `${foreignResult.chamber}-${elected.partitionId}-${elected.listId}-${elected.seatNumber}`,
          candidateId,
          name: elected.candidate.name,
          age: "-",
          partyId: elected.listId,
          partyName: subjectNameById.get(elected.listId) ?? elected.listId,
          chamber,
          electedIn: formatForeignPartitionName(result, elected.partitionId),
          nominationType: "foreign",
          listPosition: elected.candidate.list_position,
          color: partyColor(elected.listId)
        };
      })
    );
  return [...nationalSeats, ...foreignSeats].sort((a, b) => {
    const chamberOrder = String(a.chamber).localeCompare(String(b.chamber));
    return chamberOrder || a.partyName.localeCompare(b.partyName) || a.name.localeCompare(b.name);
  });
}

function proclaimedMemberCount(result: ElectionSimulationResult): number {
  return result.electedCandidates.length + Object.values(result.foreignResults).reduce(
    (total, chamber) => total + (chamber?.electedCandidates.length ?? 0),
    0
  );
}

function buildConstituencyGroups(
  scenario: ElectionInput | undefined,
  result: ElectionSimulationResult,
  subjectNameById: Map<string, string>,
  candidateById: Map<string, Candidate>,
  t: Translation
): Array<{ id: string; name: string; rows: ConstituencyCandidateRow[] }> {
  if (!scenario) return [];

  const constituencyNameById = new Map(scenario.constituencies.map((constituency) => [constituency.id, constituency.name]));
  const districtById = new Map(scenario.multiMemberDistricts.map((district) => [district.id, district]));
  const electedByCandidateId = new Map(result.electedCandidates.map((elected) => [elected.candidateId, elected]));
  const traceByCandidateId = new Map(result.seatTrace.filter((trace) => trace.candidateId).map((trace) => [trace.candidateId as string, trace]));
  const groups = new Map<string, { id: string; name: string; rows: ConstituencyCandidateRow[] }>();

  for (const nomination of scenario.nominations ?? []) {
    if (nomination.nominationType === "bonus-constituency-list") continue;
    const district = nomination.districtId ? districtById.get(nomination.districtId) : undefined;
    const constituencyId = nomination.constituencyId ?? district?.constituencyId ?? `${nomination.chamber}-unknown`;
    const constituencyName = constituencyNameById.get(constituencyId) ?? constituencyId;
    const groupId = `${nomination.chamber}-${constituencyId}`;
    const group = groups.get(groupId) ?? {
      id: groupId,
      name: `${formatChamber(nomination.chamber, t)} - ${constituencyName}`,
      rows: []
    };
    groups.set(groupId, group);

    const candidate = candidateById.get(nomination.candidateId);
    const elected = electedByCandidateId.get(nomination.candidateId);
    const trace = traceByCandidateId.get(nomination.candidateId);
    const electedHere = Boolean(
      elected &&
        trace &&
        trace.chamber === nomination.chamber &&
        (trace.districtId === nomination.districtId || trace.constituencyId === constituencyId)
    );
    const reason = electedHere
      ? [trace?.allocationStage, trace?.ruleReference, elected?.resolutionReason].filter(Boolean).join("; ")
      : elected
        ? t.electedElsewhere
        : t.notReachedReason;

    group.rows.push({
      key: `${nomination.chamber}-${constituencyId}-${nomination.districtId ?? "territory"}-${nomination.listId}-${nomination.position}-${nomination.candidateId}`,
      name: candidate ? `${candidate.lastName} ${candidate.firstName}` : nomination.candidateId,
      chamber: nomination.chamber,
      partyName: subjectNameById.get(nomination.listId) ?? nomination.listId,
      partyId: nomination.listId,
      color: partyColor(nomination.listId),
      district: district?.name ?? nomination.districtId ?? constituencyName,
      position: nomination.position,
      elected: electedHere,
      reason
    });
  }

  for (const foreignChamber of ["camera", "senato"] as const) {
    const chamber: Chamber = foreignChamber === "senato" ? "senate" : "camera";
    const foreignResult = result.foreignResults[foreignChamber];
    const electedKeys = new Set(
      foreignResult?.electedCandidates.map((elected) =>
        foreignCandidateKey(foreignChamber, elected.partitionId, elected.listId, elected.candidate)
      ) ?? []
    );
    const electedByKey = new Map(
      foreignResult?.electedCandidates.map((elected) => [
        foreignCandidateKey(foreignChamber, elected.partitionId, elected.listId, elected.candidate),
        elected
      ]) ?? []
    );

    for (const partition of scenario.foreignElection.chambers[foreignChamber].partitions) {
      const groupId = `${foreignChamber}-${partition.id}`;
      const group = groups.get(groupId) ?? {
        id: groupId,
        name: `${formatChamber(chamber, t)} - ${t.foreignName}: ${partition.name}`,
        rows: []
      };
      groups.set(groupId, group);

      for (const list of partition.lists) {
        for (const candidate of list.candidates) {
          const key = foreignCandidateKey(foreignChamber, partition.id, list.id, candidate);
          const elected = electedByKey.get(key);
          group.rows.push({
            key,
            name: candidate.name,
            chamber,
            partyName: subjectNameById.get(list.id) ?? list.name,
            partyId: list.id,
            color: partyColor(list.id),
            district: partition.name,
            position: candidate.list_position,
            elected: electedKeys.has(key),
            reason: elected
              ? `Legge 459/2001 articolo 15; ${
                  candidate.preferences == null
                    ? t.foreignPreferencesMissing
                    : `${candidate.preferences.toLocaleString("it-IT")} preferenze`
                }`
              : t.notReachedReason
          });
        }
      }
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      rows: group.rows.sort((a, b) => Number(b.elected) - Number(a.elected) || a.partyName.localeCompare(b.partyName) || a.position - b.position || a.name.localeCompare(b.name))
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function downloadElectedCandidatesCsv(rows: ElectedSeat[], t: Translation) {
  const headers = [t.name, t.age, t.party, t.chamber, t.electedIn, t.position, t.type, "ID candidato", "ID seggio"];
  const body = rows.map((row) => [
    row.name,
    row.age,
    row.partyName,
    formatChamber(row.chamber, t),
    row.electedIn,
    String(row.listPosition),
    row.nominationType,
    row.candidateId ?? "",
    row.seatId
  ]);
  const csv = [headers, ...body].map((fields) => fields.map(csvCell).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = t.electedCandidatesFile;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function formatChamber(chamber: Chamber | "-", t?: Translation): string {
  return chamber === "camera" ? (t?.cameraName ?? "Camera") : chamber === "senate" ? (t?.senateName ?? "Senato") : "-";
}

function foreignCandidateKey(
  chamber: "camera" | "senato",
  partitionId: string,
  listId: string,
  candidate: { id?: string; name: string; list_position: number }
): string {
  return `${chamber}-${partitionId}-${listId}-${candidate.id ?? `${candidate.list_position}-${candidate.name}`}`;
}

function formatForeignPartitionName(result: ElectionSimulationResult, partitionId: string): string {
  const names: Record<string, string> = {
    EUROPA: "Europa",
    AMERICA_MERIDIONALE: "America meridionale",
    AMERICA_SETTENTRIONALE_CENTRALE: "America settentrionale e centrale",
    AFRICA_ASIA_OCEANIA_ANTARTIDE: "Africa, Asia, Oceania e Antartide"
  };
  return Object.values(result.foreignResults).some((chamber) =>
    chamber?.partitionResults.some((partition) => partition.partitionId === partitionId)
  )
    ? names[partitionId] ?? partitionId
    : partitionId;
}

function totalAssignedSeats(result: ElectionSimulationResult): number {
  return (
    (["camera", "senate"] satisfies Chamber[]).reduce((sum, chamber) => sum + nationalSeatsFor(result, chamber), 0) +
    Object.values(result.foreignResults).reduce(
      (sum, foreignResult) =>
        sum +
        (foreignResult?.partitionResults.reduce((partitionSum, partition) => partitionSum + sumSeats(partition.seats), 0) ?? 0),
      0
    )
  );
}

function nationalSubjectCount(result: ElectionSimulationResult): number {
  return (["camera", "senate"] satisfies Chamber[]).reduce(
    (sum, chamber) => sum + Object.keys(result.nationalResults[chamber]?.seats ?? {}).length,
    0
  );
}

function buildDebugRows(
  result: ElectionSimulationResult,
  subjectNameById: Map<string, string>,
  candidateById: Map<string, Candidate>,
  t: Translation
): DebugRow[] {
  const cameraBonusSeats = bonusSeatsFor(result, "camera");
  const senateBonusSeats = bonusSeatsFor(result, "senate");
  const rows: DebugRow[] = [];

  for (const chamber of ["camera", "senate"] satisfies Chamber[]) {
    const thresholds = result.thresholds[chamber];
    rows.push({
      step: t.thresholds,
      chamber: formatChamber(chamber, t),
      seats: 0,
      bonusSeats: 0,
      details: thresholds
        ? `${thresholds.admittedSingleLists.length} ${t.singleLists}, ${thresholds.admittedCoalitions.length} ${t.coalitions}, ${thresholds.excludedLists.length} ${t.excluded}`
        : t.notCalculated
    });
  }

  rows.push({
    step: t.bonus,
    chamber: t.all,
    seats: cameraBonusSeats + senateBonusSeats,
    bonusSeats: cameraBonusSeats + senateBonusSeats,
    details: result.bonus.awarded
      ? `${t.awardedTo} ${subjectNameById.get(result.bonus.winnerId ?? "") ?? result.bonus.winnerId}`
      : `${t.notAwarded}${result.bonus.failedConditions.length ? `: ${result.bonus.failedConditions.join(", ")}` : ""}`
  });

  for (const chamber of ["camera", "senate"] satisfies Chamber[]) {
    const national = result.nationalResults[chamber];
    rows.push({
      step: t.nationalAllocation,
      chamber: formatChamber(chamber, t),
      seats: nationalSeatsFor(result, chamber),
      bonusSeats: bonusSeatsFor(result, chamber),
      details: national
        ? `${Object.keys(national.seats).length} ${t.subjects}, ${formatBigInt(national.totalValidVotes)} ${t.validVotes}`
        : t.noResult
    });
  }

  for (const chamber of ["camera", "senate"] satisfies Chamber[]) {
    const territories = result.territorialResults.filter((territory) => territory.chamber === chamber);
    rows.push({
      step: t.territorialAllocation,
      chamber: formatChamber(chamber, t),
      seats: territories.reduce((sum, territory) => sum + sumSeats(territory.seats), 0),
      bonusSeats: bonusSeatsFor(result, chamber),
      details: `${territories.length} ${t.territories}, ${formatScopeCounts(territories)}`
    });
  }

  for (const chamber of ["camera", "senate"] satisfies Chamber[]) {
    const chamberSeats = buildParliamentSeats(result, subjectNameById, candidateById, t, chamber);
    const proclaimed = chamberSeats.filter((seat) => seat.candidateId).length;
    rows.push({
      step: t.proclamation,
      chamber: formatChamber(chamber, t),
      seats: chamberSeats.length,
      bonusSeats: bonusSeatsFor(result, chamber),
      details: `${proclaimed} ${t.proclaimed}, ${chamberSeats.length - proclaimed} ${t.withoutName}`
    });
  }

  if (result.ties.length > 0) {
    rows.push({
      step: t.ties,
      chamber: t.all,
      seats: result.ties.reduce((sum, tie) => sum + tie.affectedSeats.length, 0),
      bonusSeats: 0,
      details: `${result.ties.length} ${t.nonAutomaticDecisions}`
    });
  }

  return rows;
}

function nationalSeatsFor(result: ElectionSimulationResult, chamber: Chamber): number {
  return sumSeats(result.nationalResults[chamber]?.seats ?? {});
}

function bonusSeatsFor(result: ElectionSimulationResult, chamber: Chamber): number {
  return result.bonusSeatAllocations[chamber]?.territories.reduce((sum, territory) => sum + territory.seats, 0) ?? 0;
}

function sumSeats(seats: Record<string, number>): number {
  return Object.values(seats).reduce((sum, seatsForSubject) => sum + seatsForSubject, 0);
}

function formatScopeCounts(territories: ElectionSimulationResult["territorialResults"]): string {
  const counts = territories.reduce<Record<string, number>>((accumulator, territory) => {
    accumulator[territory.scope] = (accumulator[territory.scope] ?? 0) + 1;
    return accumulator;
  }, {});
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([scope, count]) => `${scope}: ${count}`)
    .join(", ");
}

function buildParliamentSeats(
  result: ElectionSimulationResult,
  subjectNameById: Map<string, string>,
  candidateById: Map<string, Candidate>,
  t: Translation,
  selectedChamber?: Chamber
): ElectedSeat[] {
  const seats = buildElectedSeats(result, subjectNameById, candidateById).filter(
    (seat) => !selectedChamber || seat.chamber === selectedChamber
  );
  const missingSeats = buildMissingProclamationSeats(result, subjectNameById, t).filter(
    (seat) => !selectedChamber || seat.chamber === selectedChamber
  );
  return [...seats, ...missingSeats].sort(compareParliamentSeats);
}

function buildParliamentLegendRows(seats: ElectedSeat[]): Array<{ partyId: string; partyName: string; color: string; seats: number }> {
  const rows = new Map<string, { partyId: string; partyName: string; color: string; seats: number }>();
  for (const seat of seats) {
    const row = rows.get(seat.partyId);
    if (row) {
      row.seats += 1;
    } else {
      rows.set(seat.partyId, {
        partyId: seat.partyId,
        partyName: seat.partyName,
        color: seat.color,
        seats: 1
      });
    }
  }
  return [...rows.values()].sort(
    (a, b) =>
      b.seats - a.seats ||
      politicalPositionRank(a.partyId, a.partyName) - politicalPositionRank(b.partyId, b.partyName) ||
      a.partyName.localeCompare(b.partyName)
  );
}

function compareParliamentSeats(a: ElectedSeat, b: ElectedSeat): number {
  return (
    politicalPositionRank(a.partyId, a.partyName) - politicalPositionRank(b.partyId, b.partyName) ||
    a.partyName.localeCompare(b.partyName) ||
    a.name.localeCompare(b.name)
  );
}

function politicalPositionRank(partyId: string, partyName: string): number {
  const key = normalizePoliticalKey(`${partyId} ${partyName}`);
  if (hasAnyPoliticalTerm(key, ["partito-comunista", "unione-popolare", "de-magistris"])) return -45;
  if (hasAnyPoliticalTerm(key, ["alleanza-verdi", "sinistra", "verdi", "partito-democratico", "democratica-e-progressista", "pd"])) return -30;
  if (hasAnyPoliticalTerm(key, ["movimento-5-stelle", "5-stelle", "impegno-civico", "centro-democratico", "europa"])) return -15;
  if (hasAnyPoliticalTerm(key, ["azione", "italia-viva", "calenda", "ora", "noi-di-centro", "mastella"])) return 0;
  if (hasAnyPoliticalTerm(key, ["forza-italia", "noi-moderati", "lupi", "toti", "brugnaro", "udc"])) return 25;
  if (hasAnyPoliticalTerm(key, ["fratelli-d-italia", "giorgia-meloni", "lega", "salvini", "futuro-nazionale", "italexit"])) return 40;
  return 10;
}

function normalizePoliticalKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function hasAnyPoliticalTerm(key: string, terms: string[]): boolean {
  return terms.some((term) => hasPoliticalTerm(key, term));
}

function hasPoliticalTerm(key: string, term: string): boolean {
  return key === term || key.startsWith(`${term}-`) || key.endsWith(`-${term}`) || key.includes(`-${term}-`);
}

function buildMissingProclamationSeats(result: ElectionSimulationResult, subjectNameById: Map<string, string>, t: Translation): ElectedSeat[] {
  return result.ties
    .filter((tie) => tie.stage.includes("candidati") || tie.stage.includes("proclamazione"))
    .flatMap((tie) =>
      tie.affectedSeats.flatMap((affectedSeatId, index) => {
        const chamber = chamberForAffectedSeat(result, affectedSeatId);
        if (!chamber) return [];
        const partyId = tie.subjects[0] ?? "unknown";
        return [
          {
            seatId: `missing-${affectedSeatId}-${index + 1}`,
            name: t.seatNotProclaimed,
            age: "-",
            partyId,
            partyName: subjectNameById.get(partyId) ?? partyId,
            chamber,
            electedIn: affectedSeatId,
            nominationType: t.assignedSeat,
            listPosition: index + 1,
            color: partyColor(partyId),
            warning: tie.legalRule
          }
        ];
      })
    );
}

function chamberForAffectedSeat(result: ElectionSimulationResult, affectedSeatId: string): Chamber | undefined {
  if (affectedSeatId.startsWith("camera-") || affectedSeatId.includes("-camera-")) return "camera";
  if (affectedSeatId.startsWith("senate-") || affectedSeatId.includes("-senate-")) return "senate";
  return result.territorialResults.find((territory) => affectedSeatId.startsWith(`${territory.territoryId}-`))?.chamber;
}

function buildArcLayout(count: number): Array<{ x: number; y: number; r: number }> {
  if (count === 0) return [];
  const rows = Math.min(8, Math.max(2, Math.ceil(Math.sqrt(count / 2))));
  const rowWeights = Array.from({ length: rows }, (_, index) => index + 3);
  const totalWeight = rowWeights.reduce((sum, weight) => sum + weight, 0);
  const rowCounts = rowWeights.map((weight) => Math.max(1, Math.round((count * weight) / totalWeight)));
  while (rowCounts.reduce((sum, value) => sum + value, 0) > count) rowCounts[rowCounts.length - 1] -= 1;
  while (rowCounts.reduce((sum, value) => sum + value, 0) < count) rowCounts[rowCounts.length - 1] += 1;

  const points: Array<{ x: number; y: number; r: number }> = [];
  rowCounts.forEach((rowCount, rowIndex) => {
    const radius = 18 + rowIndex * 5.1;
    const dotRadius = Math.max(0.8, Math.min(1.65, 7.5 / Math.sqrt(count)));
    for (let index = 0; index < rowCount; index += 1) {
      const angle = Math.PI - ((index + 0.5) / rowCount) * Math.PI;
      points.push({
        x: 50 + Math.cos(angle) * radius,
        y: 54 - Math.sin(angle) * radius,
        r: dotRadius
      });
    }
  });
  return points.slice(0, count);
}

function buildVerticalArcLayout(count: number): Array<{ x: number; y: number; r: number }> {
  return buildArcLayout(count).sort((a, b) => a.x - b.x || b.y - a.y);
}

function formatCandidateAge(candidate: Candidate | undefined): string {
  if (candidate?.age) return String(candidate.age);
  if (candidate?.birthYear) return String(2026 - candidate.birthYear);
  return "-";
}

function partyColor(partyId: string): string {
  const knownColors: Record<string, string> = {
    "coalition-forza-italia-fratelli-d-italia-con-giorgia-meloni-lega-per-salvini-premier-noi-moderati-lupi-toti-brugnaro-udc": "#1f4e8c",
    "coalition-alleanza-verdi-e-sinistra-europa-impegno-civico-luigi-di-maio-centro-democratico-partito-democratico-italia-democratica-e-progressista": "#c83e4d",
    "fratelli-d-italia-con-giorgia-meloni": "#243f7f",
    "forza-italia": "#4f7fc8",
    "lega-per-salvini-premier": "#2f7d50",
    "partito-democratico-italia-democratica-e-progressista": "#c83e4d",
    "alleanza-verdi-e-sinistra": "#4f9d69",
    "movimento-5-stelle": "#d4a514",
    "azione-italia-viva-calenda": "#2f9fa3"
  };
  if (knownColors[partyId]) return knownColors[partyId];
  const palette = ["#d84f4b", "#3268b8", "#2f9d66", "#d2a23a", "#7c5cc4", "#2f9fa3", "#c4578a", "#67743f", "#8d5a35", "#5f7387"];
  let hash = 0;
  for (let index = 0; index < partyId.length; index += 1) {
    hash = (hash * 31 + partyId.charCodeAt(index)) >>> 0;
  }
  return palette[hash % palette.length];
}
