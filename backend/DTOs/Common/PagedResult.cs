namespace MlPortfolio.Api.DTOs.Common;

/// <summary>
/// Generic envelope for one page of results, returned by list endpoints. Pairs
/// the page's <see cref="Items"/> with the metadata a client needs to render
/// pagination controls.
/// </summary>
/// <typeparam name="T">Element type of the page (typically a response DTO).</typeparam>
public class PagedResult<T>
{
    public IEnumerable<T> Items { get; init; } = [];

    /// <summary>Total matching items across all pages, for computing page count.</summary>
    public int Total { get; init; }

    public int Page { get; init; }
    public int PageSize { get; init; }
}
