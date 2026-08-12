import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

/**
 * `vite dev`는 api/ 를 실행하지 않는다. 배포 환경(Vercel)과 동일한 핸들러를
 * 개발 서버에서도 태우기 위한 얇은 어댑터. 프로덕션 경로에는 관여하지 않는다.
 */
function apiDev(): Plugin {
  return {
    name: 'api-dev',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/chat', (req, res) => {
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          void (async () => {
            try {
              const mod = await server.ssrLoadModule('/api/chat.ts')
              const request = new Request('http://localhost/api/chat', {
                method: req.method,
                headers: { 'content-type': 'application/json' },
                body: chunks.length ? Buffer.concat(chunks) : undefined,
              })
              const result: Response = await mod.default(request)
              res.statusCode = result.status
              res.setHeader('content-type', 'application/json')
              res.end(await result.text())
            } catch (err) {
              server.config.logger.error(`[api/chat] ${String(err)}`)
              res.statusCode = 500
              res.setHeader('content-type', 'application/json')
              res.end(JSON.stringify({ error: 'dev_handler_failed' }))
            }
          })()
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 서버리스 함수는 process.env를 읽는다. 개발 서버에서도 같은 소스를 쓴다.
  // 접두사 허용목록 — 클라이언트 번들에는 어차피 주입되지 않는다(VITE_ 접두사가 아님).
  Object.assign(process.env, loadEnv(mode, process.cwd(), ['GEMINI_', 'ANTHROPIC_']))

  return {
    plugins: [react(), babel({ presets: [reactCompilerPreset()] }), apiDev()],
  }
})
