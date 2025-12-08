require("dotenv").config();
const mongoose = require("mongoose");
const axios = require("axios");

const { MONGODB_URI, DB_NAME, OPENALEX_AUTHOR_ID } = process.env;
if (!MONGODB_URI || !DB_NAME || !OPENALEX_AUTHOR_ID) {
  console.error("Missing MONGODB_URI, DB_NAME, or OPENALEX_AUTHOR_ID");
  process.exit(1);
}

const PublicationSchema = new mongoose.Schema(
  {
    source: { type: String, default: "openalex" },
    external_id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    authors_ieee: String,
    year: Number,
    venue: String,
    doi_url: String,
    is_active: { type: Boolean, default: true },
    last_synced_at: Date,
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

const Publication = mongoose.model("Publication", PublicationSchema);

// Formatting to IEEE style
function toIeee(authorships = []) {
  const names = authorships.map((a) => a?.author?.display_name).filter(Boolean);
  return names
    .map((n) => {
      const parts = n.trim().split(/\s+/);
      if (parts.length === 1) {
        return parts[0];
      }
      const last = parts.pop();
      const initials = parts.map((w) => w[0]?.toUpperCase() + ".").join(" ");
      return `${initials} ${last}`;
    })
    .join(", ");
}

// Fetching all publications, seaches 200 at a time, handles calling API multiple times if needed
async function fetchAllWorks(authorId) {
  const results = [];
  let cursor = "*";
  const perPage = 200;
  while (true) {
    const { data } = await axios.get("https://api.openalex.org/works", {
      params: {
        filter: `author.id:${authorId}`,
        per_page: perPage,
        cursor,
        sort: "publication_year:desc",
      },
      timeout: 30000,
    });
    results.push(...(data.results || []));
    if (!data.meta?.next_cursor) break;
    cursor = data.meta.next_cursor;
    if (results.length > 2000) break;
  }
  return results;
}

// Main sync function
(async () => {
  await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
  const now = new Date();

  const works = await fetchAllWorks(OPENALEX_AUTHOR_ID);

  const seen = new Set();

  for (const w of works) {
    const external_id = w.id;
    if (!external_id) continue;
    seen.add(external_id);

    const authors_ieee = toIeee(w.authorships);
    const venue = w.primary_location?.source?.display_name || undefined;
    const doi_url = w.doi || w.ids?.doi || undefined;

    await Publication.findOneAndUpdate(
      { external_id },
      {
        source: "openalex",
        external_id,
        title: w.title || "",
        authors_ieee,
        year: w.publication_year || undefined,
        venue,
        doi_url,
        is_active: true,
        last_synced_at: now,
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
  }

  // Mark unseen ones as inactive
  await Publication.updateMany(
    { source: "openalex", external_id: { $nin: Array.from(seen) } },
    { $set: { is_active: false, last_synced_at: now } }
  );

  const count = await Publication.countDocuments();
  await mongoose.disconnect();
})();
