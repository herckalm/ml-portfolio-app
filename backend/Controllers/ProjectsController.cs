using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MlPortfolio.Api.DTOs;
using MlPortfolio.Api.DTOs.Common;
using MlPortfolio.Api.Services;

namespace MlPortfolio.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ProjectsController : ControllerBase
{
    private readonly IProjectService _service;

    public ProjectsController(IProjectService service)
    {
        _service = service;
    }

    // GET /api/projects?page=1&pageSize=10
    // Authenticated. Returns the CALLER'S OWN projects (drafts + published).
    [Authorize]
    [HttpGet]
    public async Task<ActionResult<PagedResult<ProjectResponseDto>>> GetMine([FromQuery] PaginationQuery query)
    {
        var result = await _service.GetMyProjectsAsync(CurrentUserId(), query);
        return Ok(result);
    }

    // GET /api/projects/{id}
    // Public. Published projects only — a draft or missing id is a 404.
    [HttpGet("{id:int}")]
    public async Task<ActionResult<ProjectResponseDto>> GetById(int id)
    {
        var project = await _service.GetPublishedByIdAsync(id);
        return Ok(project);
    }

    // POST /api/projects — authenticated. Owner comes from the JWT, never the body.
    [Authorize]
    [HttpPost]
    public async Task<ActionResult<ProjectResponseDto>> Create(CreateProjectDto dto)
    {
        var created = await _service.CreateAsync(dto, CurrentUserId());
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }

    // PUT /api/projects/{id} — owner only (cross-tenant => 404).
    [Authorize]
    [HttpPut("{id:int}")]
    public async Task<ActionResult<ProjectResponseDto>> Update(int id, UpdateProjectDto dto)
    {
        var updated = await _service.UpdateAsync(id, dto, CurrentUserId());
        return Ok(updated);
    }

    // PATCH /api/projects/{id}/publish — owner only. Flips draft <-> published.
    [Authorize]
    [HttpPatch("{id:int}/publish")]
    public async Task<ActionResult<ProjectResponseDto>> SetPublished(int id, SetPublishedDto dto)
    {
        var updated = await _service.SetPublishedAsync(id, dto.IsPublished, CurrentUserId());
        return Ok(updated);
    }

    // DELETE /api/projects/{id} — owner only (cross-tenant => 404).
    [Authorize]
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        await _service.DeleteAsync(id, CurrentUserId());
        return NoContent();
    }

    // owner identity is ALWAYS derived from the validated JWT, never from client input.
    private int CurrentUserId() =>
        int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
}