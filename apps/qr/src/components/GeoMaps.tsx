import { geoNaturalEarth1, geoAlbersUsa, geoPath, type GeoProjection } from "d3-geo";
import { feature } from "topojson-client";
import countries from "i18n-iso-countries";
import en from "i18n-iso-countries/langs/en.json";
import world from "world-atlas/countries-110m.json";
import us from "us-atlas/states-10m.json";

countries.registerLocale(en as any);
type Count = { label: string; n: number };

const worldFeatures = (feature(world as any, (world as any).objects.countries) as any).features as any[];
const stateFeatures = (feature(us as any, (us as any).objects.states) as any).features as any[];

function Map({ features, projection, w, h, valueOf, nameOf, ariaLabel }: {
  features: any[]; projection: GeoProjection; w: number; h: number;
  valueOf: (f: any) => number; nameOf: (f: any) => string; ariaLabel: string;
}) {
  const path = geoPath(projection.fitSize([w, h], { type: "FeatureCollection", features } as any));
  const max = Math.max(1, ...features.map(valueOf));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={ariaLabel} style={{ width: "100%", height: "auto" }}>
      {features.map((f, i) => {
        const v = valueOf(f);
        const fill = v > 0 ? `color-mix(in srgb, var(--accent) ${Math.round(22 + 78 * Math.sqrt(v / max))}%, var(--land))` : "var(--land)";
        return (
          <path key={i} d={path(f) ?? ""} fill={fill} stroke="var(--bg)" strokeWidth="0.6">
            <title>{`${nameOf(f)}: ${v} ${v === 1 ? "scan" : "scans"}`}</title>
          </path>
        );
      })}
    </svg>
  );
}

function Scale({ max }: { max: number }) {
  return (
    <div className="row mute" style={{ gap: 6, marginTop: 4 }}>
      <span>0</span>
      <span style={{ height: 8, width: 120, borderRadius: 4, background: "linear-gradient(90deg, var(--land), var(--accent))" }} />
      <span>{max.toLocaleString("en-US")} scans</span>
    </div>
  );
}

/** World map of scans by country, and a US-states map when there are US scans. */
export function GeoMaps({ countriesData, regionsData }: { countriesData: Count[]; regionsData: Count[] }) {
  const byNumeric = new globalThis.Map<number, number>();
  for (const c of countriesData) {
    const num = countries.alpha2ToNumeric(c.label);
    if (num) byNumeric.set(Number(num), c.n);
  }
  const byState = new globalThis.Map(regionsData.map((r) => [r.label, r.n]));
  const worldMax = Math.max(1, ...byNumeric.values());
  const usTotal = countriesData.find((c) => c.label === "US")?.n ?? 0;
  const stateMax = Math.max(1, ...byState.values());
  const hasStates = [...byState.keys()].some((k) => stateFeatures.some((f) => f.properties.name === k));
  return (
    <div className="maps">
      <div>
        <Map features={worldFeatures} projection={geoNaturalEarth1()} w={800} h={420} ariaLabel="World map shaded by scan count"
          valueOf={(f) => byNumeric.get(Number(f.id)) ?? 0} nameOf={(f) => f.properties.name} />
        <Scale max={worldMax} />
      </div>
      {usTotal > 0 && hasStates && (
        <div>
          <Map features={stateFeatures} projection={geoAlbersUsa()} w={800} h={500} ariaLabel="US map shaded by scan count by state"
            valueOf={(f) => byState.get(f.properties.name) ?? 0} nameOf={(f) => f.properties.name} />
          <Scale max={stateMax} />
        </div>
      )}
    </div>
  );
}
