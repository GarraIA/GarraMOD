# 🇧🇷 GarraIA MODs para o Claude Code

Marketplace `garraia-mods`, com o **Garra MOD**: o Claude Code com a identidade do GarraIA (pt-BR, tema Garra Brasil, painel `/garra`) e uma ponte multiagente real com o GarraIA (GarraRUST) e o Hermes Agent.

| Plugin | Pasta | Descrição |
| --- | --- | --- |
| `garra-mod` | [plugins/garra-mod](plugins/garra-mod) | MOD principal — veja o [README do plugin](plugins/garra-mod/README.md) |

## Instalação

No prompt de uma sessão do Claude Code no terminal:

```text
/plugin install garra-mod --marketplace michelbr84/garra-mod
```

Responda `y` para adicionar o marketplace e escolha o escopo **user** (vale para todos os projetos). Depois digite `/garra`.

Pelo shell:

```bash
claude plugin install garra-mod --marketplace michelbr84/garra-mod
```

No app desktop, onde `/plugin` não roda: clique em **+** ao lado da caixa do prompt → **Plugins** → **Add marketplace** com `michelbr84/garra-mod` → **Add plugin**.

**Repositório privado:** a instalação só funciona para quem tem acesso de leitura ao repositório no GitHub e já tem uma credencial do git para github.com nesta máquina (chave SSH, ou `gh auth login` seguido de `gh auth setup-git`). A instalação nunca pede essa credencial.

Para desenvolver a partir de um clone: `claude plugin marketplace add <pasta do clone>` e `claude plugin install garra-mod@garraia-mods`. O Claude Code lê o plugin direto da pasta (editou, rode `/reload-plugins`).

Futuras extensões do GarraIA entram como novas pastas em `plugins/` e novas entradas em `.claude-plugin/marketplace.json`.

Licença MIT. O logo em `plugins/garra-mod/assets/garraia-logo.png` vem do repositório [GarraRUST](https://github.com/michelbr84/GarraRUST) (MIT, GarraIA Contributors).
