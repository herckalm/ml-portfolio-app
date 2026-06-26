using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MlPortfolio.Api.DTOs;
using MlPortfolio.Api.DTOs.Common;
using MlPortfolio.Api.Services;

namespace MlPortfolio.Api.Controllers;

/// <summary>
/// Project CRUD under <c>api/projects</c> (route derived from the controller
/// name via <c>[controller]</c>). Mixed access: one public read of a single
/// published project; everything else is authenticated and scoped to the caller.
/// Two invariants run through the whole controller — owner identity is taken
/// from the JWT and never the request body, and owner-only operations on someone
/// else's (or a nonexistent) project return 404 rather than 403, so the API
/// never reveals whether a foreign id exists.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class ProjectsController : ControllerBase
{
    private readonly IProjectService _service;

    public ProjectsController(IProjectService service)
    {
        _service = service;
    }

    /// <summary>
    /// GET <c>/api/projects</c> — authenticated. Returns the caller's own
    /// projects, drafts included, paged. (Public listing goes through the users
    /// controller by handle instead.)
    /// </summary>
    [Authorize]
    [HttpGet]
    public async Task<ActionResult<PagedResult<ProjectResponseDto>>> GetMine([FromQuery] PaginationQuery query)
    {
        var result = await _service.GetMyProjectsAsync(CurrentUserId(), query);
        return Ok(result);
    }

    /// <summary>GET <c>/api/projects/{id}</c> — public; published only, so a draft or missing id is 404.</summary>
    [HttpGet("{id:int}")]
    public async Task<ActionResult<ProjectResponseDto>> GetById(int id)
    {
        var project = await _service.GetPublishedByIdAsync(id);
        return Ok(project);
    }

    /// <summary>
    /// POST <c>/api/projects</c> — authenticated. Owner is set from the JWT.
    /// Returns 201 with a Location header pointing at <see cref="GetById"/>.
    /// </summary>
    [Authorize]
    [HttpPost]
    public async Task<ActionResult<ProjectResponseDto>> Create(CreateProjectDto dto)
    {
        var created = await _service.CreateAsync(dto, CurrentUserId());
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }

    /// <summary>PUT <c>/api/projects/{id}</c> — owner only; cross-tenant access is a 404.</summary>
    [Authorize]
    [HttpPut("{id:int}")]
    public async Task<ActionResult<ProjectResponseDto>> Update(int id, UpdateProjectDto dto)
    {
        var updated = await _service.UpdateAsync(id, dto, CurrentUserId());
        return Ok(updated);
    }

    /// <summary>PATCH <c>/api/projects/{id}/publish</c> — owner only; toggles draft ↔ published.</summary>
    [Authorize]
    [HttpPatch("{id:int}/publish")]
    public async Task<ActionResult<ProjectResponseDto>> SetPublished(int id, SetPublishedDto dto)
    {
        var updated = await _service.SetPublishedAsync(id, dto.IsPublished, CurrentUserId());
        return Ok(updated);
    }

    /// <summary>DELETE <c>/api/projects/{id}</c> — owner only; cross-tenant access is a 404.</summary>
    [Authorize]
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        await _service.DeleteAsync(id, CurrentUserId());
        return NoContent();
    }

    /// <summary>
    /// Resolves the caller's user id from the validated JWT's NameIdentifier
    /// claim. Owner identity is always derived here, never from client input.
    /// </summary>
    private int CurrentUserId() =>
        int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
}