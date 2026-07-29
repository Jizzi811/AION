type WeatherTarget = "current" | "today" | "tomorrow" | "day_after_tomorrow" | "week";

type GeocodingResult = {
  id?: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  country_code?: string;
  admin1?: string;
  timezone?: string;
};

type ForecastResponse = {
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    precipitation?: number;
    weather_code?: number;
    wind_speed_10m?: number;
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: Array<number | null>;
    precipitation_sum?: number[];
    wind_speed_10m_max?: number[];
  };
};

export type WeatherAnswer = {
  message: string;
  speechMessage: string;
  location?: string;
  source: {
    title: string;
    url: string;
  };
};

const weatherSource = {
  title: "Open-Meteo Wetterdaten",
  url: "https://open-meteo.com/",
};

const weatherWords =
  /\b(wie|wird|ist|sind|das|der|die|den|es|bitte|aion|ayon|wetter|wetterbericht|wettervorhersage|vorhersage|prognose|temperatur|temperaturen|regnet|regen|schneit|schnee|sonnig|windig|warm|kalt|aktuell|gerade|jetzt|heute|morgen|übermorgen|diese|dieser|nächste|kommende|woche|wochenende|aus|für|von|bei)\b/giu;

const countryCodes: Array<[RegExp, string]> = [
  [/\b(schweiz|switzerland|suisse|svizzera)\b/i, "CH"],
  [/\b(deutschland|germany|allemagne)\b/i, "DE"],
  [/\b(österreich|austria|autriche)\b/i, "AT"],
  [/\b(france|frankreich)\b/i, "FR"],
  [/\b(italien|italy|italia)\b/i, "IT"],
  [/\b(spanien|spain|españa)\b/i, "ES"],
  [/\b(niederlande|netherlands)\b/i, "NL"],
  [/\b(belgien|belgium)\b/i, "BE"],
  [/\b(großbritannien|vereinigtes königreich|united kingdom|uk)\b/i, "GB"],
  [/\b(usa|vereinigte staaten|united states)\b/i, "US"],
  [/\b(kanada|canada)\b/i, "CA"],
  [/\b(australien|australia)\b/i, "AU"],
];

const locationAliases: Array<[RegExp, string]> = [
  // Häufige Schreibvariante aus der Spracheingabe; der offizielle Name hat ein l.
  [/\bhuttwill\b/gi, "Huttwil"],
];

function rounded(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function weatherDescription(code: number | null | undefined) {
  if (code === 0) return "klar";
  if (code === 1) return "überwiegend klar";
  if (code === 2) return "teilweise bewölkt";
  if (code === 3) return "bedeckt";
  if (code === 45 || code === 48) return "neblig";
  if ([51, 53, 55].includes(code ?? -1)) return "Nieselregen";
  if ([56, 57].includes(code ?? -1)) return "gefrierender Nieselregen";
  if ([61, 63, 65].includes(code ?? -1)) return "Regen";
  if ([66, 67].includes(code ?? -1)) return "gefrierender Regen";
  if ([71, 73, 75].includes(code ?? -1)) return "Schneefall";
  if (code === 77) return "Schneegriesel";
  if ([80, 81, 82].includes(code ?? -1)) return "Regenschauer";
  if ([85, 86].includes(code ?? -1)) return "Schneeschauer";
  if (code === 95) return "Gewitter";
  if ([96, 99].includes(code ?? -1)) return "Gewitter mit Hagel";
  return "wechselhaft";
}

function detectTarget(text: string): WeatherTarget {
  if (/\b(übermorgen|day after tomorrow)\b/i.test(text)) return "day_after_tomorrow";
  if (/\b(morgen|tomorrow)\b/i.test(text)) return "tomorrow";
  if (/\b(woche|wochenende|week|weekend)\b/i.test(text)) return "week";
  if (/\b(aktuell|gerade|jetzt|momentan|current|now)\b/i.test(text)) return "current";
  return "today";
}

function canonicalizeLocation(value: string) {
  let location = value;
  for (const [pattern, replacement] of locationAliases) {
    location = location.replace(pattern, replacement);
  }

  return location
    .replace(/\b(?:in|aus)\s+der\s+(Schweiz)\b/gi, ", $1")
    .replace(/\b(?:in|aus)\s+(Deutschland|Österreich|Frankreich|Italien|Spanien)\b/gi, ", $1")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/^[,.\s]+|[,?.!\s]+$/g, "")
    .trim();
}

export function extractWeatherLocation(text: string, isFollowUp = false) {
  const followUp =
    text.match(/Antwort auf deine Rückfrage:\s*(.+)$/i)?.[1]?.trim() ||
    (isFollowUp ? text.trim() : "");
  if (followUp) return canonicalizeLocation(followUp);

  const normalized = text.replace(/\s+/g, " ").trim();
  const prepositionMatch = normalized.match(
    /\b(?:in|für|bei)\s+(.+?)(?=\s+(?:heute|morgen|übermorgen|am\s|diese\s|nächste\s|kommende\s)|[?.!]|$)/i,
  );
  if (prepositionMatch?.[1]) {
    return canonicalizeLocation(prepositionMatch[1]);
  }

  const fallback = canonicalizeLocation(
    normalized
      .replace(/Aktuelle Live-Recherche fortsetzen\.?/gi, "")
      .replace(weatherWords, " ")
      .replace(/\b(in|im|am|einer|einem)\b/giu, " ")
      .replace(/\s+/g, " "),
  );
  return fallback.length >= 2 ? fallback : "";
}

function getCountryCode(location: string) {
  return countryCodes.find(([pattern]) => pattern.test(location))?.[1];
}

function getPlaceName(location: string) {
  const countryPattern = countryCodes.find(([pattern]) => pattern.test(location))?.[0];
  return location
    .split(",")[0]
    .replace(countryPattern || /$^/, "")
    .replace(/\b(in|der|die|das)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function geocode(location: string) {
  const placeName = getPlaceName(location);
  if (!placeName) return null;

  const params = new URLSearchParams({
    name: placeName,
    count: "5",
    language: "de",
    format: "json",
  });
  const countryCode = getCountryCode(location);
  if (countryCode) params.set("countryCode", countryCode);

  const response = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?${params}`,
    { cache: "no-store", signal: AbortSignal.timeout(8_000) },
  );
  if (!response.ok) throw new Error(`weather_geocoding_${response.status}`);

  const payload = (await response.json()) as { results?: GeocodingResult[] };
  return payload.results?.[0] || null;
}

function formatLocation(location: GeocodingResult) {
  const parts = [location.name];
  if (location.admin1 && location.admin1.toLocaleLowerCase("de") !== location.name.toLocaleLowerCase("de")) {
    parts.push(location.admin1);
  }
  if (location.country) parts.push(location.country);
  return parts.join(", ");
}

async function loadForecast(location: GeocodingResult) {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    timezone: "auto",
    forecast_days: "7",
    current:
      "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`weather_forecast_${response.status}`);
  return (await response.json()) as ForecastResponse;
}

function dailySentence(
  forecast: ForecastResponse,
  index: number,
  label: string,
  locationName: string,
) {
  const daily = forecast.daily;
  const high = rounded(daily?.temperature_2m_max?.[index]);
  const low = rounded(daily?.temperature_2m_min?.[index]);
  const rain = rounded(daily?.precipitation_probability_max?.[index]);
  const wind = rounded(daily?.wind_speed_10m_max?.[index]);
  const condition = weatherDescription(daily?.weather_code?.[index]);

  if (high === null || low === null) {
    throw new Error("weather_daily_data_missing");
  }

  return `${label} in ${locationName} wird es ${condition}, mit ${high} Grad Celsius als Höchstwert und ${low} Grad Celsius als Tiefstwert. Die Niederschlagswahrscheinlichkeit liegt bei ${rain ?? 0} Prozent, der Wind erreicht bis zu ${wind ?? 0} Kilometer pro Stunde.`;
}

export async function answerWeatherQuestion(
  question: string,
  options?: { isFollowUp?: boolean },
): Promise<WeatherAnswer> {
  const requestedLocation = extractWeatherLocation(question, options?.isFollowUp);
  if (!requestedLocation) {
    return {
      message: "Für welchen Ort möchtest du die Wettervorhersage?",
      speechMessage: "Für welchen Ort möchtest du die Wettervorhersage?",
      source: weatherSource,
    };
  }

  const location = await geocode(requestedLocation);
  if (!location) {
    return {
      message: `Ich konnte „${requestedLocation}“ nicht eindeutig finden. Nenne mir bitte Ort und Land noch einmal.`,
      speechMessage: `Ich konnte ${requestedLocation} nicht eindeutig finden. Nenne mir bitte Ort und Land noch einmal.`,
      source: weatherSource,
    };
  }

  const forecast = await loadForecast(location);
  const locationName = formatLocation(location);
  const target = detectTarget(question);
  let speechMessage: string;

  if (target === "current") {
    const temperature = rounded(forecast.current?.temperature_2m);
    const feelsLike = rounded(forecast.current?.apparent_temperature);
    const wind = rounded(forecast.current?.wind_speed_10m);
    if (temperature === null) throw new Error("weather_current_data_missing");
    speechMessage = `In ${locationName} sind es aktuell ${temperature} Grad Celsius, gefühlt ${feelsLike ?? temperature} Grad Celsius. Es ist ${weatherDescription(forecast.current?.weather_code)}, bei Wind um ${wind ?? 0} Kilometer pro Stunde.`;
  } else if (target === "tomorrow") {
    speechMessage = dailySentence(forecast, 1, "Morgen", locationName);
  } else if (target === "day_after_tomorrow") {
    speechMessage = dailySentence(forecast, 2, "Übermorgen", locationName);
  } else if (target === "week") {
    const daily = forecast.daily;
    const highs = (daily?.temperature_2m_max || []).slice(0, 7).filter(Number.isFinite);
    const lows = (daily?.temperature_2m_min || []).slice(0, 7).filter(Number.isFinite);
    const rain = (daily?.precipitation_probability_max || [])
      .slice(0, 7)
      .filter((value): value is number => typeof value === "number");
    if (!highs.length || !lows.length) throw new Error("weather_week_data_missing");
    speechMessage = `In ${locationName} liegen die Höchstwerte in den nächsten sieben Tagen zwischen ${Math.round(Math.min(...highs))} und ${Math.round(Math.max(...highs))} Grad Celsius. Die Tiefstwerte liegen zwischen ${Math.round(Math.min(...lows))} und ${Math.round(Math.max(...lows))} Grad Celsius. Die höchste tägliche Niederschlagswahrscheinlichkeit beträgt ${rain.length ? Math.round(Math.max(...rain)) : 0} Prozent.`;
  } else {
    speechMessage = dailySentence(forecast, 0, "Heute", locationName);
  }

  console.info("[weather] forecast resolved", {
    place: location.name,
    countryCode: location.country_code,
    target,
  });

  return {
    message: speechMessage,
    speechMessage,
    location: locationName,
    source: weatherSource,
  };
}
