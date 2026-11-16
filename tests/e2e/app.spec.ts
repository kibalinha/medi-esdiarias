import { expect, test } from "@playwright/test";

test.describe("Medições Diárias — E2E Fluxos Principais", () => {
  test("Technician: login -> /campo (Chillers ocultos) -> leitura online -> leitura offline -> reconexão/sync -> alerta queda", async ({
    page,
    context,
  }) => {
    await page.goto("/login");
    await expect(page.getByText("Modo Local", { exact: true })).toBeVisible({
      timeout: 15000,
    });

    await page.getByRole("button", { name: /Técnico de Campo/i }).click();
    await page.waitForURL("**/campo");

    // Strict RBAC: Technician nav must hide Planilha & Configurações and redirect /planilha & /configuracoes -> /campo
    await expect(page.getByRole("link", { name: /^Planilha$/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Configurações/i })).toHaveCount(0);
    await page.goto("/planilha");
    await page.waitForURL("**/campo");
    await page.goto("/configuracoes");
    await page.waitForURL("**/campo");

    // Chillers 1 and 2 must be hidden in Field Mode initially
    await expect(page.getByText("Chiller 1")).toHaveCount(0);
    await expect(page.getByText("Chiller 2")).toHaveCount(0);

    // Água accordion is open by default; save Horas de Carregamento (photo optional)
    const horasInput = page.getByTestId("input-agua_horas_carregamento");
    await expect(horasInput).toBeVisible();
    await horasInput.fill("4");
    await page.getByTestId("save-agua_horas_carregamento").click();
    await expect(page.getByText("Sincronizado", { exact: true }).first()).toBeVisible();

    // Test drop-without-flag warning on Reuso
    const reusoInput = page.getByTestId("input-agua_reuso");
    await reusoInput.fill("4");
    await expect(
      page.getByText(/Leitura menor que a anterior/i),
    ).toBeVisible();

    // Open Temperatura Externa accordion and test offline queue + sync on reconnect
    await page.getByRole("button", { name: /Temperatura Externa/i }).click();
    const tempExtInput = page.getByTestId("input-temp_externa");
    await expect(tempExtInput).toBeVisible();

    await context.setOffline(true);
    await tempExtInput.fill("27.5");
    await page.getByTestId("save-temp_externa").click();
    await expect(
      page.getByText("Na fila offline", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByTestId("connectivity-pill")).toContainText(
      /Offline - 1 item na fila/i,
    );

    // Restore network: browser 'online' event triggers automatic queue flush
    await context.setOffline(false);
    const pill = page.getByTestId("connectivity-pill");
    const syncBtn = page.getByRole("button", { name: /Sincronizar agora/i });
    try {
      await expect(pill).toHaveText("Online", { timeout: 5000 });
    } catch {
      if (await syncBtn.isEnabled().catch(() => false)) {
        await syncBtn.click();
      }
      await expect(pill).toHaveText("Online", { timeout: 10000 });
    }
    await expect(page.getByText("Na fila offline", { exact: true })).toHaveCount(0);
  });

  test("Manager: login -> /planilha (KPIs + grid + bloqueio CALCULATED + InspectionDrawer) -> /configuracoes (ativar Chiller 1) -> visível em /campo", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.getByText("Modo Local", { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole("button", { name: /Gestor \/ Admin/i }).click();
    await page.waitForURL("**/planilha");

    // KPIs & Legend + Ascending Calendar Order (01/01 -> 31/12) visible
    await expect(page.getByText(/Consumo Água/i).first()).toBeVisible();
    await expect(
      page.getByText(/CALCULATED \/ YoY/i).first(),
    ).toBeVisible();
    await expect(page.getByText(/Ordem: 01\/01/i)).toBeVisible();

    // Verify table renders frozen Date header, starts at 2026-01-01 (ascending), and blocks CALCULATED cells
    await expect(page.getByRole("columnheader", { name: /^Data$/i })).toBeVisible();
    const firstRow = page.locator("tbody tr[data-reading-date]").first();
    await expect(firstRow).toHaveAttribute("data-reading-date", "2026-01-01");
    const calcCell = page.locator('td[data-col-kind="CALCULATED"]').first();
    await expect(calcCell).toBeVisible();
    await expect(calcCell).toHaveAttribute("data-editable", "false");

    // Clicking CALCULATED cell must NOT open InspectionDrawer
    await calcCell.click();
    await expect(page.getByText(/Inspeção de Leitura/i)).toHaveCount(0);

    // Clicking an empty INPUT cell on 2026-01-02 opens InspectionDrawer to insert a reading manually
    const emptyInputCell = page
      .locator(
        'tbody tr[data-reading-date="2026-01-02"] td[data-col-kind="INPUT"][data-cell-empty="true"]',
      )
      .first();
    await expect(emptyInputCell).toBeVisible();
    const emptyColKey = await emptyInputCell.getAttribute("data-col-key");
    expect(emptyColKey).toBeTruthy();

    await emptyInputCell.click();
    await expect(page.getByText(/Célula sem leitura lançada em 2026-01-02/i)).toBeVisible();
    await page.getByPlaceholder("Digite o valor...").fill("123");
    await page.getByRole("button", { name: /Salvar leitura/i }).click();
    await expect(
      page.locator(
        `tbody tr[data-reading-date="2026-01-02"] td[data-col-key="${emptyColKey}"]`,
      ),
    ).toHaveAttribute("data-cell-empty", "false");
    await page.keyboard.press("Escape");

    // Reload /planilha and verify manual reading persisted
    await page.reload();
    await expect(
      page.locator(
        `tbody tr[data-reading-date="2026-01-02"] td[data-col-key="${emptyColKey}"]`,
      ),
    ).toHaveAttribute("data-cell-empty", "false");

    // Inline double-click edit on another empty INPUT cell on 2026-01-02
    const secondEmptyCell = page
      .locator(
        'tbody tr[data-reading-date="2026-01-02"] td[data-col-kind="INPUT"][data-cell-empty="true"]',
      )
      .first();
    await expect(secondEmptyCell).toBeVisible();
    const secondEmptyColKey = await secondEmptyCell.getAttribute("data-col-key");
    expect(secondEmptyColKey).toBeTruthy();

    await secondEmptyCell.dblclick();
    const inlineInput = page.getByTestId(
      `inline-input-2026-01-02-${secondEmptyColKey}`,
    );
    await expect(inlineInput).toBeVisible();
    await inlineInput.fill("456");
    await inlineInput.press("Enter");
    await expect(
      page.locator(
        `tbody tr[data-reading-date="2026-01-02"] td[data-col-key="${secondEmptyColKey}"]`,
      ),
    ).toHaveAttribute("data-cell-empty", "false");

    // Verify + Preencher indicator is visible on empty INPUT cells
    await expect(
      page
        .locator('tbody tr[data-reading-date="2026-01-02"] td[data-col-kind="INPUT"][data-cell-empty="true"]')
        .first()
        .getByText("+ Preencher"),
    ).toBeVisible();

    // Quick Edit Mode (1-click inline Excel editing + Tab navigation)
    const quickEditToggle = page.getByTestId("toggle-quick-edit");
    await expect(quickEditToggle).toHaveAttribute("aria-pressed", "false");
    await quickEditToggle.click();
    await expect(quickEditToggle).toHaveAttribute("aria-pressed", "true");

    const quickEmptyCell = page
      .locator(
        'tbody tr[data-reading-date="2026-01-02"] td[data-col-kind="INPUT"][data-cell-empty="true"]',
      )
      .first();
    await expect(quickEmptyCell).toBeVisible();
    const quickColKey = await quickEmptyCell.getAttribute("data-col-key");
    expect(quickColKey).toBeTruthy();

    await quickEmptyCell.click();
    const quickInlineInput = page.getByTestId(
      `inline-input-2026-01-02-${quickColKey}`,
    );
    await expect(quickInlineInput).toBeVisible();
    await expect(page.getByText(/Célula sem leitura lançada/i)).toHaveCount(0);
    await quickInlineInput.fill("789");
    await quickInlineInput.press("Tab");
    await expect(
      page.locator(
        `tbody tr[data-reading-date="2026-01-02"] td[data-col-key="${quickColKey}"]`,
      ),
    ).toHaveAttribute("data-cell-empty", "false");
    await page.keyboard.press("Escape");

    // Disable Quick Edit Mode and test "+ Lançar Leitura" modal
    await quickEditToggle.click();
    await expect(quickEditToggle).toHaveAttribute("aria-pressed", "false");

    await page.getByTestId("open-manual-entry").click();
    await expect(
      page.getByRole("heading", { name: /Lançamento Manual na Planilha/i }),
    ).toBeVisible();
    await page.locator("#manual-entry-date").fill("2026-01-03");
    await page.locator("#manual-entry-meter").selectOption("agua_horas_carregamento");
    await page.locator("#manual-entry-value").fill("6");
    await page.getByRole("button", { name: /Salvar na planilha/i }).click();
    await expect(
      page.locator(
        'tbody tr[data-reading-date="2026-01-03"] td[data-col-key="agua_horas_carregamento"]',
      ),
    ).toHaveAttribute("data-cell-empty", "false");

    // Scroll to bottom of virtualized grid and verify 31/12 (2026-12-31) is at the base
    const gridScroll = page.getByTestId("excel-grid-scroll");
    await gridScroll.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(
      page.locator('tbody tr[data-reading-date="2026-12-31"]'),
    ).toBeVisible();
    await gridScroll.evaluate((el) => {
      el.scrollTop = 0;
    });

    // Navigate to /configuracoes and enable Chiller 1 in Modo Campo
    await page.goto("/configuracoes");
    await expect(
      page.getByText(/Setores da Ronda \(Ativação no Modo Campo\)/i),
    ).toBeVisible();

    const chillerCard = page.getByTestId("group-card-chiller_1");
    await expect(chillerCard).toBeVisible();
    if (await chillerCard.getByText("Oculto no Modo Campo").isVisible()) {
      await page.getByTestId("toggle-group-chiller_1").click();
      await expect(
        chillerCard.getByText("Visível no Modo Campo"),
      ).toBeVisible();
    }

    // Verify Chiller 1 now appears in /campo
    await page.goto("/campo");
    await expect(page.getByText("Chiller 1").first()).toBeVisible();

    // Restore Chiller 1 back to hidden
    await page.goto("/configuracoes");
    if (
      await page
        .getByTestId("group-card-chiller_1")
        .getByText("Visível no Modo Campo")
        .isVisible()
    ) {
      await page.getByTestId("toggle-group-chiller_1").click();
      await expect(
        page.getByTestId("group-card-chiller_1").getByText("Oculto no Modo Campo"),
      ).toBeVisible();
    }
  });
});
