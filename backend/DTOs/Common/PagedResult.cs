namespace MlPortfolio.Api.DTOs.Common;

public class PagedResult<T>
{
    public IEnumerable<T> Items { get; init; } = [];
    public int Total { get; init; }
    public int Page { get; init; }
    public int PageSize { get; init; }
}