import { NextResponse } from 'next/server';
import { readDataPlate } from '@/lib/aiVision';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PUBLIC — the website's Plumber's Brain sends a data-plate photo here during the water-heater flow.
// Returns the read specs (brand/model/fuel/capacity/year) so the Brain can give a sharper estimate.
// Fail-soft: an unreadable photo just returns plate:null and the flow continues ("we'll confirm on site").
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
export function OPTIONS() { return new NextResponse(null, { headers: CORS }); }

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false }, { status: 400, headers: CORS }); }
  const photo = String(body.photo || body.platePhoto || '');
  if (!/^data:image\//.test(photo)) return NextResponse.json({ ok: false, error: 'Send a photo of the data plate.' }, { status: 422, headers: CORS });
  let plate = null;
  try { plate = await readDataPlate(photo.slice(0, 12_000_000), 'office'); } catch (_) {}
  if (!plate) return NextResponse.json({ ok: true, plate: null, message: "I couldn't quite read that plate — no worries, we'll confirm the exact unit on site." }, { headers: CORS });
  // Decode age from the manufacture year (when the plate showed it), so the estimate can flag an aging unit.
  const yr = Number(plate.year);
  const ageYears = Number.isFinite(yr) && yr > 1980 && yr <= new Date().getFullYear() ? new Date().getFullYear() - yr : null;
  // A short customer-friendly summary the Brain can echo back.
  const fuel = { 'NATURAL GAS': 'gas', 'LP / PROPANE': 'propane', 'ELECTRIC': 'electric' }[plate.fuelType] || '';
  const summary = [plate.brand, plate.capacityGallons ? plate.capacityGallons + '-gal' : '', fuel, 'water heater', ageYears != null ? `(~${ageYears} yr old)` : ''].filter(Boolean).join(' ');
  return NextResponse.json({ ok: true, plate: { ...plate, ageYears }, summary }, { headers: CORS });
}
