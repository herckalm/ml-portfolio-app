namespace MlPortfolio.Api.DTOs.Common;

/// <summary>
/// Query-string binding for paginated list endpoints. Carries the requested page
/// and page size, with page size defensively clamped to protect the database from
/// oversized result requests.
/// </summary>
public class PaginationQuery
{
    private int _pageSize = 10;

    /// <summary>1-based page number; defaults to the first page.</summary>
    public int Page { get; init; } = 1;

    /// <summary>
    /// Items per page. Defaults to 10, hard-capped at 50 — a larger requested
    /// value is silently reduced. The cap is an upper bound only; values at or
    /// below 50 (including non-positive ones) pass through unchanged.
    /// </summary>
    public int PageSize
    {
        get => _pageSize;
        init => _pageSize = value > 50 ? 50 : value;
    }
}