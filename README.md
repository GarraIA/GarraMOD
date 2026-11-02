# 🇧🇷 GarraIA MODs para o Claude Code

Marketplace `garraia-mods`, com o **Garra MOD**: o Claude Code com a identidade do GarraIA (pt-BR, tema Garra Brasil, painel `/garra`) e uma ponte multiagente real com o GarraIA (GarraRUST) e o Hermes Agent.

| Plugin | Pasta | Descrição |
| --- | --- | --- |
| `garra-mod` | [plugins/garra-mod](plugins/garra-mod) | MOD principal — veja o [README do plugin](plugins/garra-mod/README.md) |

## Instalação

No prompt de uma sessão do Claude Code no terminal:

```text
/plugin install garra-mod --marketplace GarraIA/GarraMOD
```

Responda `y` para adicionar o marketplace e escolha o escopo **user** (vale para todos os projetos). Depois digite `/garra`.

Pelo shell:

```bash
claude plugin install garra-mod --marketplace GarraIA/GarraMOD
```

No app desktop, onde `/plugin` não roda: clique em **+** ao lado da caixa do prompt → **Plugins** → **Add marketplace** com `GarraIA/GarraMOD` → **Add plugin**.

Para desenvolver a partir de um clone: `claude plugin marketplace add <pasta do clone>` e `claude plugin install garra-mod@garraia-mods`. O Claude Code lê o plugin direto da pasta (editou, rode `/reload-plugins`).

Futuras extensões do GarraIA entram como novas pastas em `plugins/` e novas entradas em `.claude-plugin/marketplace.json`.

Licença MIT. O logo em `plugins/garra-mod/assets/garraia-logo.png` vem do repositório [GarraRUST](https://github.com/michelbr84/GarraRUST) (MIT, GarraIA Contributors).

Projeto independente da comunidade GarraIA, sem afiliação com a Anthropic nem endosso dela. Claude e Claude Code são marcas da Anthropic, PBC.
