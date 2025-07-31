# Projeto de Segurança do Sistema - To-Do

---

## 1. Sanitização no Backend (Prevenção de SQL Injection)

* **Objetivo:** Garantir que todas as interações com o banco de dados sejam seguras contra `SQL Injection`.
    * [ ] Migrar todas as queries para uso de **Prepared Statements** (ex: `PDO`, `ORM`, `Django ORM`).
    * [ ] Eliminar *toda e qualquer* concatenação direta de `SQL` com entradas do usuário.

---

## 2. Validação de Dados (Duas Camadas)

### 2.1. Frontend (Experiência do Usuário - UX)

* **Objetivo:** Oferecer feedback imediato e melhorar a experiência do usuário com validações básicas.
    * [ ] Implementar validação `HTML5` para campos de formulário (`required`, `pattern`, `type`, `minlength`, `maxlength`).
    * [ ] Desenvolver validações `JavaScript` para feedback em tempo real e regras mais complexas.

### 2.2. Backend (Segurança Robusta)

* **Objetivo:** Assegurar que apenas dados válidos e seguros sejam processados e persistidos.
    * [ ] Aplicar validação rigorosa de **tipo**, **comprimento** e **formato** (`regex`) para *todos* os dados de entrada.
    * [ ] Realizar sanitização adequada dos dados no backend antes de qualquer processamento ou armazenamento.

---

## 3. Proteção CSRF (Cross-Site Request Forgery)

* **Objetivo:** Proteger contra ataques que exploram a confiança do navegador no usuário.
    * [ ] Implementar geração e verificação de **tokens `CSRF` únicos por sessão** para todas as requisições de modificação (`POST`, `PUT`, `DELETE`).
    * [ ] Configurar a **rotação periódica** dos tokens `CSRF` para aumentar a segurança.

---

## 4. Rate-Limiting e Captcha

* **Objetivo:** Proteger contra ataques automatizados como força bruta e fuzzing.
    * [ ] Aplicar **Rate-Limiting por IP** para restringir o número de requisições em um determinado período.
    * [ ] Integrar um sistema de **`Captcha`** em pontos críticos (ex: login, recuperação de senha, submissões de formulário sensíveis).

---

## 5. Logs e Monitoramento

* **Objetivo:** Manter visibilidade sobre o comportamento do sistema e identificar atividades suspeitas.
    * [ ] Configurar o log de **todas as submissões de dados**, incluindo `IP de origem` e `User-Agent`.
    * [ ] Implementar **alertas** para entradas e atividades consideradas suspeitas nos logs.

---

## 6. Escapar Dados na Exibição (Prevenção de XSS)

* **Objetivo:** Evitar a injeção de scripts maliciosos na interface do usuário.
    * [ ] Garantir que **todos os dados** gerados pelo usuário ou provenientes de fontes externas sejam **escapados corretamente** antes de serem exibidos no frontend.
