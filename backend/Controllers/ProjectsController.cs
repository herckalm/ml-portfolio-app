using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MlPortfolio.Api.DTOs;
using MlPortfolio.Api.Domain.Entities;
using MlPortfolio.Api.Infrastructure.Data;

namespace MlPortfolio.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ProjectsController : ControllerBase
{
    private readonly AppDbContext _db;

    public ProjectsController(AppDbContext db)
    {
        _db = db;
    }

    // GET /api/projects — public
    [HttpGet]
    public async Task<ActionResult<IEnumerable<ProjectResponseDto>>> GetAll()
    {
        var projects = await _db.Projects
            .OrderByDescending(p => p.CreatedAt)
            .Select(p => ToDto(p))
            .ToListAsync();

        return Ok(projects);
    }

    // GET /api/projects/{id} — public
    [HttpGet("{id:int}")]
    public async Task<ActionResult<ProjectResponseDto>> GetById(int id)
    {
        var project = await _db.Projects.FindAsync(id);
        if (project is null) return NotFound();
        return Ok(ToDto(project));
    }

    // POST /api/projects — authenticated, stamps OwnerId from JWT
    [Authorize]
    [HttpPost]
    public async Task<ActionResult<ProjectResponseDto>> Create(CreateProjectDto dto)
    {
        // extract userId from JWT claim
        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var project = new Project
        {
            Title = dto.Title,
            Description = dto.Description,
            Domain = dto.Domain,
            ModelType = dto.ModelType,
            CreatedAt = DateTime.UtcNow,
            OwnerId = userId  // stamp ownership
        };

        _db.Projects.Add(project);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = project.Id }, ToDto(project));
    }

    // PUT /api/projects/{id} — owner only
    [Authorize]
    [HttpPut("{id:int}")]
    public async Task<ActionResult<ProjectResponseDto>> Update(int id, UpdateProjectDto dto)
    {
        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!); 

        var project = await _db.Projects.FindAsync(id);
        if (project is null) return NotFound();

        // 403 if not owner
        if (project.OwnerId != userId) return Forbid();

        project.Title = dto.Title;
        project.Description = dto.Description;
        project.Domain = dto.Domain;
        project.ModelType = dto.ModelType;

        await _db.SaveChangesAsync();
        return Ok(ToDto(project));
    }

    // DELETE /api/projects/{id} — owner only
    [Authorize]
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!); 

        var project = await _db.Projects.FindAsync(id);
        if (project is null) return NotFound();

        // 403 if not owner
        if (project.OwnerId != userId) return Forbid();

        _db.Projects.Remove(project);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static ProjectResponseDto ToDto(Project p) => new()
    {
        Id = p.Id,
        Title = p.Title,
        Description = p.Description,
        Domain = p.Domain,
        ModelType = p.ModelType ?? string.Empty,
        CreatedAt = p.CreatedAt,
        OwnerId = p.OwnerId  
    };
}
