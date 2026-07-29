type YouTubeSearchItem = {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: {
      high?: { url?: string };
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const genericMusicQueryPattern =
  /^(hören|listen|musik|music|etwas|was|song|lied|track|album|playlist|spielen|abspielen)$/i;

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim();
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!query || genericMusicQueryPattern.test(query)) {
    return Response.json({ error: "Bitte nenne einen Titel, Künstler oder eine Stimmung." }, { status: 400 });
  }
  if (!apiKey) {
    return Response.json(
      { error: "Die YouTube-Suche ist noch nicht vollständig konfiguriert." },
      { status: 503 },
    );
  }

  const searchParams = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoCategoryId: "10",
    videoEmbeddable: "true",
    videoSyndicated: "true",
    safeSearch: "moderate",
    maxResults: "1",
    q: query,
    key: apiKey,
  });

  try {
    console.info("[api/youtube/search] request", { queryLength: query.length });
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`,
      { cache: "no-store" },
    );
    const body = (await response.json()) as {
      items?: YouTubeSearchItem[];
      error?: { message?: string };
    };

    if (!response.ok) {
      throw new Error(body.error?.message || "YouTube konnte nicht durchsucht werden.");
    }

    const result = body.items?.find((item) => item.id?.videoId);
    const videoId = result?.id?.videoId;
    if (!result || !videoId) {
      console.warn("[api/youtube/search] no playable result");
      return Response.json(
        { error: "Dazu habe ich gerade keinen abspielbaren Titel gefunden." },
        { status: 404 },
      );
    }

    const thumbnails = result.snippet?.thumbnails;
    console.info("[api/youtube/search] success", { videoId });
    return Response.json({
      video: {
        id: videoId,
        title: result.snippet?.title || query,
        channel: result.snippet?.channelTitle || "YouTube",
        thumbnail:
          thumbnails?.high?.url ||
          thumbnails?.medium?.url ||
          thumbnails?.default?.url ||
          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      },
    });
  } catch (error) {
    console.error("[api/youtube/search] failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Die YouTube-Suche ist gerade nicht erreichbar.",
      },
      { status: 502 },
    );
  }
}
