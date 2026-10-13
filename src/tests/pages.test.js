import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import config from '../../vite.config.js';
describe('publication GitHub Pages',()=>{
  it('possède un verrou npm portable compatible avec les versions testées',()=>{
    const pkg=JSON.parse(readFileSync('package.json','utf8')),raw=readFileSync('package-lock.json','utf8'),lock=JSON.parse(raw);
    expect(lock.lockfileVersion).toBe(3);expect(lock.packages[''].dependencies).toEqual(pkg.dependencies);expect(lock.packages[''].devDependencies).toEqual(pkg.devDependencies);expect(raw).not.toMatch(/file:|[A-Z]:\\/);
  });
  it('sert les assets sous le dépôt en CI et avec des chemins relatifs en local',()=>{
    expect(config.base).toBe(process.env.GITHUB_ACTIONS==='true'?`/${process.env.GITHUB_REPOSITORY.split('/')[1]}/`:'./');
    expect(readFileSync('index.html','utf8')).not.toMatch(/[A-Z]:\\/);
  });
  it('valide avant de publier et ne déploie jamais une pull request',()=>{
    const workflow=readFileSync('.github/workflows/deploy.yml','utf8');expect(workflow).toContain('npm ci');expect(workflow).toContain('npm test');expect(workflow).toContain('npm run build');expect(workflow).toContain("github.event_name != 'pull_request'");expect(workflow).toContain('github.event.repository.default_branch');expect(workflow).toContain('needs: build');expect(workflow).toContain('path: dist');expect(workflow).toContain("node-version: '22'");expect(workflow).toContain('pages: write');expect(workflow).toContain('id-token: write');
  });
});
