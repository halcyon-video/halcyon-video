import { manifest } from '../../catalog/load';
export function GET() { return new Response(JSON.stringify(manifest)); }
