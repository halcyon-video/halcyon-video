// Build-time adapter: reuse the existing pure definitions, never the store boot graph
// or its guessed title-search links. Browser interactions consume generated JSON only.
import { DEFAULT_STREAMING_SERVICES } from '../../../src/streaming-catalog.ts';
export const services = DEFAULT_STREAMING_SERVICES.map(({ id, name, aliases }) => ({ id, name, aliases: [...aliases] }));
export function matchingProviderIds(serviceId: string, providers: { id: number; name: string }[]) {
  const aliases = services.find(service => service.id === serviceId)?.aliases.map(name => name.toLowerCase()) ?? [];
  return [...new Set(providers.filter(provider => aliases.includes(provider.name.toLowerCase())).map(provider => provider.id))];
}
