import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { formatBigInt, formatPercent, percentage } from "../../electoral-engine/arithmetic/fraction";
import type { Chamber } from "../../electoral-engine/domain/chamber";
import type { Candidate, ElectionInput, ElectionSimulationResult } from "../../electoral-engine/domain/election";
import { loadLegacyCameraCsv } from "../../datasets/loaders/legacy-csv-loader";
import { loadScenarioJson } from "../../datasets/loaders/json-loader";
import { aggregateVotes } from "../../electoral-engine/pipeline/aggregate-votes";
import { useAppStore } from "../../app/store";
import cameraCandidateListUrl from "../../../data/input/camera-2022-candidatilista.csv?url";
import cameraScrutiniUrl from "../../../data/input/Politiche2022_Scrutini_Camera_Italia.csv?url";
import senateCandidateListUrl from "../../../data/input/senato-2022-candlista.csv?url";
import senateScrutiniUrl from "../../../data/input/Politiche2022_Scrutini_Senato_Italia.csv?url";
import bonusCandidateListsUrl from "../../../data/input/bonus-candidates-2022-random.csv?url";
import foreignElectionUrl from "../../../data/input/estero.json?url";

type Language = "it" | "en";

const sampleDataFiles = [
  { url: cameraScrutiniUrl, name: "Politiche2022_Scrutini_Camera_Italia.csv" },
  { url: senateScrutiniUrl, name: "Politiche2022_Scrutini_Senato_Italia.csv" },
  { url: cameraCandidateListUrl, name: "camera-2022-candidatilista.csv" },
  { url: senateCandidateListUrl, name: "senato-2022-candlista.csv" },
  { url: bonusCandidateListsUrl, name: "bonus-candidates-2022-random.csv" },
  { url: foreignElectionUrl, name: "estero.json" }
] as const;

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
    lead: "Simulazione dei seggi parlamentari secondo la proposta AC 2822-A approvata dalla Camera nel 2026.",
    loadDemo: "Carica dati 2022",
    demoLoadedRandomBonus: "Dati 2022 caricati. La lista premio usa candidati random.",
    downloadSample: "Scarica ZIP dati 2022",
    importJsonCsv: "Importa i tuoi dati",
    help: "Aiuto",
    helpTitle: "Dati richiesti",
    helpIntro: "Questo simulatore gira nel browser. Puoi partire dal demo 2022, modificare i CSV e reimportarli per vedere come cambiano seggi, premio e proclamati.",
    helpClose: "Chiudi aiuto",
    helpItems: [
      {
        label: "Come partire",
        body:
          "Usa Carica scenario demo per vedere subito un risultato. Usa Scarica dati 2022 per ottenere i CSV modificabili. Dopo averli cambiati, selezionali tutti insieme con Importa JSON/CSV."
      },
      {
        label: "Quali file servono",
        body:
          "Importa i due file scrutini Camera e Senato per calcolare i seggi nazionali. Aggiungi estero.json per includere la circoscrizione Estero. Aggiungi i due file candidati per vedere i nomi dei parlamentari proclamati. Aggiungi il file bonus-candidates per vedere chi entra con il premio."
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
    names: "nomi",
    debugLog: "Debug log",
    steps: "step",
    emptyTitle: "Importa uno scenario o usa il dataset demo",
    emptyBody: "Il calcolo avviene interamente nel browser e usa aritmetica esatta nel motore TypeScript.",
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
    senateName: "Senato"
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
    lead: "Parliamentary seat simulation under the AC 2822-A proposal approved by the Chamber in 2026.",
    loadDemo: "Load 2022 data",
    demoLoadedRandomBonus: "2022 data loaded. The bonus list uses random candidates.",
    downloadSample: "Download 2022 ZIP",
    importJsonCsv: "Import your data",
    help: "Help",
    helpTitle: "Required data",
    helpIntro: "This simulator runs in the browser. Start from the 2022 demo, edit the CSVs, and import them again to see how seats, the bonus, and proclaimed members change.",
    helpClose: "Close help",
    helpItems: [
      {
        label: "How to start",
        body:
          "Use Load demo scenario to see a result immediately. Use Download 2022 data to get editable CSVs. After changing them, select all files together with Import JSON/CSV."
      },
      {
        label: "Which files matter",
        body:
          "Import the Chamber and Senate vote files to calculate national seats. Add estero.json to include the foreign constituency. Add the two candidate-list files to see proclaimed member names. Add the bonus-candidates file to see who enters through the bonus."
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
    names: "names",
    debugLog: "Debug log",
    steps: "steps",
    emptyTitle: "Import a scenario or use the demo dataset",
    emptyBody: "The calculation runs entirely in the browser and uses exact arithmetic in the TypeScript engine.",
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
    senateName: "Senate"
  }
} as const;

type Translation = (typeof translations)[Language];

export function ResultsPage() {
  const { scenario, result, loadScenario, loadOnDataFiles, loadFixture } = useAppStore();
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
  const [helpOpen, setHelpOpen] = useState(false);
  const t = translations[language];
  const themeToggleLabel = darkTheme ? t.themeLight : t.themeDark;
  const subtitle = scenario?.lawVersion ? `${t.lead} ${t.law}: ${scenario.lawVersion}` : t.lead;
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
      await loadFixture();
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
      for (const file of sampleDataFiles) {
        const response = await fetch(file.url);
        if (!response.ok) throw new Error(`${t.sampleDownloadFailed} ${file.name}`);
        files.push({ name: file.name, data: new Uint8Array(await response.arrayBuffer()) });
        await nextFrame();
      }
      downloadBlob(buildZip(files), "dati-2022.zip");
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
          foreignElectionJson: foreignElection.text
        });
      } else {
        const loaded = csvFiles.length > 1
          ? failImport(t.unrecognizedFolder)
          : selected[0]?.name.toLowerCase().endsWith(".csv")
            ? loadLegacyCameraCsv(texts[0].text)
            : loadScenarioJson(texts[0].text);
        await loadScenario(loaded);
      }
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
              <button type="button" className="secondaryButton helpButton" aria-label={t.helpTitle} onClick={() => setHelpOpen(true)}>
                ?
              </button>
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
          <div className="actions">
            <div className="primaryActions">
              <button type="button" onClick={() => void downloadSampleData()}>{t.downloadSample}</button>
              <button type="button" onClick={() => void loadDemo()}>{t.loadDemo}</button>
              <label className="fileButton">
                {t.importJsonCsv}
                <input
                  type="file"
                  accept=".json,.csv,application/json,text/csv"
                  multiple
                  onChange={(event) => {
                    const files = event.target.files;
                    if (files?.length) void importFiles(files);
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      </section>

      {helpOpen ? <HelpDialog t={t} onClose={() => setHelpOpen(false)} /> : null}

      {loadingStatus ? <div className="loadingBanner">{loadingStatus}</div> : null}
      {error ? <div className="alert">{error}</div> : null}
      {notice ? <div className="noticeBanner">{notice}</div> : null}

      {result ? (
        <section className="resultCards" aria-label={t.simulationResults}>
          <CollapsibleCard title={t.nationalResults} meta={`${nationalSubjectCount(result)} ${t.subjects}`} defaultOpen>
            <ChamberResult chamber="camera" scenario={scenario} result={result} subjectNameById={subjectNameById} t={t} />
            <ChamberResult chamber="senate" scenario={scenario} result={result} subjectNameById={subjectNameById} t={t} />
          </CollapsibleCard>
          <CollapsibleCard title={t.parliamentArcs} meta={`${totalAssignedSeats(result)} ${t.seats}`} defaultOpen>
            <ParliamentArcsOverview result={result} subjectNameById={subjectNameById} candidateById={candidateById} t={t} />
          </CollapsibleCard>
          <CollapsibleCard title={t.bonusDetails} meta={result.bonus.awarded ? t.bonusYes : t.bonusNo} defaultOpen>
            <BonusReport scenario={scenario} result={result} subjectNameById={subjectNameById} candidateById={candidateById} t={t} />
          </CollapsibleCard>
          <CollapsibleCard title={t.proclaimedMembers} meta={`${result.electedCandidates.length} ${t.names}`}>
            <ElectedCandidatesReport result={result} subjectNameById={subjectNameById} candidateById={candidateById} t={t} />
          </CollapsibleCard>
          <CollapsibleCard title={t.constituencyReport} meta={`${scenario?.constituencies.length ?? 0} ${t.constituency.toLowerCase()}`}>
            <ConstituencyReport scenario={scenario} result={result} subjectNameById={subjectNameById} candidateById={candidateById} t={t} />
          </CollapsibleCard>
          <CollapsibleCard title={t.debugLog} meta={`${buildDebugRows(result, subjectNameById, candidateById, t).length} ${t.steps}`}>
            <DebugLog result={result} subjectNameById={subjectNameById} candidateById={candidateById} t={t} />
          </CollapsibleCard>
        </section>
      ) : (
        <section className="emptyState">
          <h2>{t.emptyTitle}</h2>
          <p>{t.emptyBody}</p>
        </section>
      )}
    </main>
  );
}

function HelpDialog({ t, onClose }: { t: Translation; onClose: () => void }) {
  return (
    <div className="dialogBackdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="helpDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="helpDialogHeader">
          <h2 id="help-dialog-title">{t.helpTitle}</h2>
          <button type="button" className="secondaryButton helpCloseButton" aria-label={t.helpClose} onClick={onClose}>
            x
          </button>
        </div>
        <p>{t.helpIntro}</p>
        <dl className="helpList">
          {t.helpItems.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.body}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function CollapsibleCard({
  title,
  meta,
  defaultOpen,
  children
}: {
  title: string;
  meta?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="resultCard" open={defaultOpen}>
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

function buildZip(files: ZipFile[]): Blob {
  const encoder = new TextEncoder();
  const localParts: Array<Uint8Array<ArrayBuffer>> = [];
  const centralParts: Array<Uint8Array<ArrayBuffer>> = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const localHeader = createZipLocalHeader(name, crc, file.data.length);
    const centralHeader = createZipCentralHeader(name, crc, file.data.length, offset);
    localParts.push(localHeader, file.data);
    centralParts.push(centralHeader);
    offset += localHeader.byteLength + file.data.byteLength;
  }

  const centralDirectorySize = centralParts.reduce((sum, part) => sum + part.byteLength, 0);
  const endRecord = createZipEndRecord(files.length, centralDirectorySize, offset);
  return new Blob([...localParts, ...centralParts, endRecord], { type: "application/zip" });
}

function createZipLocalHeader(name: Uint8Array<ArrayBuffer>, crc: number, size: number): Uint8Array<ArrayBuffer> {
  const header = new Uint8Array(30 + name.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  writeZipTimestamp(view, 10);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, name.length, true);
  view.setUint16(28, 0, true);
  header.set(name, 30);
  return header;
}

function createZipCentralHeader(name: Uint8Array<ArrayBuffer>, crc: number, size: number, localOffset: number): Uint8Array<ArrayBuffer> {
  const header = new Uint8Array(46 + name.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  writeZipTimestamp(view, 12);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
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
  result: NonNullable<ReturnType<typeof useAppStore.getState>["result"]>;
  subjectNameById: Map<string, string>;
  t: Translation;
}) {
  const national = result.nationalResults[chamber];
  const [expandedCoalitions, setExpandedCoalitions] = useState<Set<string>>(() => new Set());
  const coalitionById = useMemo(() => new Map(scenario?.coalitions.map((coalition) => [coalition.id, coalition]) ?? []), [scenario]);
  const listVoteTotals = useMemo(() => (scenario ? aggregateVotes(scenario)[chamber].listVotes : {}), [scenario, chamber]);
  const rows = national ? Object.entries(national.seats).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) : [];
  if (!national) return null;
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
        <span>{formatBigInt(national.totalValidVotes)} {t.validVotes}</span>
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
            const subjectVotes = national.votes[subjectId];
            const subjectPercent = national.percentages[subjectId] ?? (subjectVotes === undefined ? undefined : percentage(subjectVotes, national.totalValidVotes));
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
                  <td>{formatBigInt(national.votes[subjectId] ?? 0n)}</td>
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
                          <td>{formatPercent(percentage(votes, national.totalValidVotes))}</td>
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
          electedIn: elected.partitionId,
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

function buildConstituencyGroups(
  scenario: ElectionInput | undefined,
  result: ElectionSimulationResult,
  subjectNameById: Map<string, string>,
  candidateById: Map<string, Candidate>,
  t: Translation
): Array<{ id: string; name: string; rows: ConstituencyCandidateRow[] }> {
  if (!scenario?.nominations?.length) return [];

  const constituencyNameById = new Map(scenario.constituencies.map((constituency) => [constituency.id, constituency.name]));
  const districtById = new Map(scenario.multiMemberDistricts.map((district) => [district.id, district]));
  const electedByCandidateId = new Map(result.electedCandidates.map((elected) => [elected.candidateId, elected]));
  const traceByCandidateId = new Map(result.seatTrace.filter((trace) => trace.candidateId).map((trace) => [trace.candidateId as string, trace]));
  const groups = new Map<string, { id: string; name: string; rows: ConstituencyCandidateRow[] }>();

  for (const nomination of scenario.nominations) {
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
