using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MlPortfolio.Api.DTOs;
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

    // GET /api/projects — public
    [HttpGet]
    public async Task<ActionResult<IEnumerable<ProjectResponseDto>>> GetAll()
    {
        var projects = await _service.GetAllAsync();
        return Ok(projects);
    }

    // GET /api/projects/{id} — public
    [HttpGet("{id:int}")]
    public async Task<ActionResult<ProjectResponseDto>> GetById(int id)
    {
        var project = await _service.GetByIdAsync(id);
        if (project is null) return NotFound();
        return Ok(project);
    }

    // POST /api/projects — authenticated
    [Authorize]
    [HttpPost]
    public async Task<ActionResult<ProjectResponseDto>> Create(CreateProjectDto dto)
    {
        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var created = await _service.CreateAsync(dto, userId);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }

    // PUT /api/projects/{id} — owner only
    [Authorize]
    [HttpPut("{id:int}")]
    public async Task<ActionResult<ProjectResponseDto>> Update(int id, UpdateProjectDto dto)
    {
        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        try
        {
            var updated = await _service.UpdateAsync(id, dto, userId);
            if (updated is null) return NotFound();
            return Ok(updated);
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
    }

    // DELETE /api/projects/{id} — owner only
    [Authorize]
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        try
        {
            var deleted = await _service.DeleteAsync(id, userId);
            if (!deleted) return NotFound();
            return NoContent();
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
    }
}
