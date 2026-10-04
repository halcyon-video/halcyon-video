export function caseFallbackShader(sourceAspect: number): string { return `
          vec2 fallbackUv = posterUv;
          float aspectRatio = vFallbackAspect / ${sourceAspect};
          if (aspectRatio > 1.0) fallbackUv.x = (fallbackUv.x - 0.5) * aspectRatio + 0.5;
          else fallbackUv.y = (fallbackUv.y - 0.5) / aspectRatio + 0.5;
          mapTexel = (fallbackUv.x < 0.0 || fallbackUv.x > 1.0 || fallbackUv.y < 0.0 || fallbackUv.y > 1.0)
            ? vec4(0.08, 0.08, 0.08, 1.0) : texture(map, fallbackUv);
`; }
